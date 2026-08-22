/**
 * FFmpegService.js
 * 负责统一管理所有的 FFmpeg 进程，剥离底层进程调用与业务路由的耦合
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const binaries = require('../utils/binaries');
const ProcessManager = require('../utils/ProcessManager');
const isTestEnv = process.env.NODE_ENV === 'test';

function debugLog(...args) {
    if (!isTestEnv) {
        console.log(...args);
    }
}

class FFmpegService {
    constructor() {
        this.activeProcesses = new Map();
    }

    /**
     * 取消任务
     * @param {string} taskId 任务ID
     */
    cancelTask(taskId) {
        if (taskId && this.activeProcesses.has(taskId)) {
            const processInfo = this.activeProcesses.get(taskId);
            try {
                processInfo.cancelled = true;
                if (processInfo.proc) {
                    processInfo.proc.kill();
                    debugLog(`[FFmpegService] Process ${taskId} killed`);
                }
                this.activeProcesses.delete(taskId);
                return { success: true };
            } catch (e) {
                console.error(`[FFmpegService] Failed to kill process ${taskId}:`, e);
                return { success: false, error: e.message };
            }
        } else if (!taskId) {
            console.warn('[FFmpegService] No taskId provided, cancelling all processes');
            for (const [id, info] of this.activeProcesses.entries()) {
                if (info.proc) info.proc.kill();
                this.activeProcesses.delete(id);
            }
            return { success: true };
        }
        return { success: false, error: 'Task not found or already finished' };
    }

    /**
     * 运行探测命令 (如 ffprobe)
     */
    async getDuration(filePath) {
        const ffprobePath = binaries.getFfprobePath();
        return new Promise((resolve) => {
            exec(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
                (err, stdout) => resolve(parseFloat(stdout) || 0));
        });
    }

    /**
     * 统一的进程发起与管控
     */
    runFFmpegTask(taskId, args, onData, onClose, onError) {
        const ffmpegPath = binaries.getFfmpegPath();
        const proc = spawn(ffmpegPath, args);

        this.activeProcesses.set(taskId, { proc, cancelled: false });
        ProcessManager.register(taskId, proc);

        if (onData) {
            proc.stderr.on('data', (data) => {
                const info = this.activeProcesses.get(taskId);
                if (!info?.cancelled) {
                    onData(data.toString());
                }
            });
        }

        proc.on('close', (code) => {
            const info = this.activeProcesses.get(taskId);
            this.activeProcesses.delete(taskId);
            if (onClose) onClose(code, info?.cancelled);
        });

        proc.on('error', (err) => {
            this.activeProcesses.delete(taskId);
            if (onError) onError(err);
        });

        return proc;
    }

    /**
     * 检测静音
     */
    detectSilence(taskId, filePath, threshold, minDuration) {
        return new Promise((resolve) => {
            const args = [
                '-i', filePath,
                '-af', `silencedetect=n=${threshold}dB:d=${minDuration}`,
                '-f', 'null',
                '-'
            ];

            let output = '';
            debugLog(`[FFmpegService] Starting silence detection [${taskId}]:`, args.join(' '));

            this.runFFmpegTask(
                taskId,
                args,
                (data) => { output += data; },
                (code, cancelled) => {
                    if (cancelled) return resolve({ success: false, error: 'Cancelled' });
                    if (code !== 0 && !output.includes('silence_start')) {
                        return resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                    }

                    const segments = [];
                    const lines = output.split('\n');
                    let currentStart = null;

                    for (const line of lines) {
                        const startMatch = line.match(/silence_start: ([\d.]+)/);
                        const endMatch = line.match(/silence_end: ([\d.]+)/);

                        if (startMatch) currentStart = parseFloat(startMatch[1]);
                        if (endMatch && currentStart !== null) {
                            segments.push({ start: currentStart, end: parseFloat(endMatch[1]) });
                            currentStart = null;
                        }
                    }
                    debugLog(`[FFmpegService] Detected ${segments.length} silence segments [${taskId}]`);
                    resolve({ success: true, segments });
                },
                (err) => resolve({ success: false, error: err.message })
            );
        });
    }

    /**
     * 移除静音
     */
    removeSilence(taskId, filePath, outputPath, keepSegments, totalKeepDuration, onProgress) {
        let filterComplex = '';
        if (keepSegments.length === 1) {
            const seg = keepSegments[0];
            filterComplex = `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,scale='trunc(iw/2)*2:trunc(ih/2)*2'[outv];\n` +
                `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[outa]`;
        } else {
            let concatInputs = '';
            keepSegments.forEach((seg, i) => {
                filterComplex += `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,scale='trunc(iw/2)*2:trunc(ih/2)*2'[v${i}];\n`;
                filterComplex += `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}];\n`;
                concatInputs += `[v${i}][a${i}]`;
            });
            filterComplex += `${concatInputs}concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`;
        }

        const tempFilterPath = path.join(require('os').tmpdir(), `ffmpeg_filter_${taskId}.txt`);
        fs.writeFileSync(tempFilterPath, filterComplex);

        const args = [
            '-y', '-i', filePath,
            '-filter_complex_script', tempFilterPath,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            outputPath
        ];

        return new Promise((resolve) => {
            let stderrBuffer = '';

            this.runFFmpegTask(
                taskId,
                args,
                (data) => {
                    stderrBuffer += data;
                    const timeMatch = stderrBuffer.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                    if (timeMatch && totalKeepDuration > 0 && onProgress) {
                        const seconds = parseFloat(timeMatch[1]) * 3600 + parseFloat(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                        const progress = Math.min(100, Math.round((seconds / totalKeepDuration) * 100));
                        onProgress(progress);
                    }
                },
                (code, cancelled) => {
                    if (fs.existsSync(tempFilterPath)) fs.unlinkSync(tempFilterPath);
                    if (cancelled) return resolve({ success: false, cancelled: true });
                    if (code === 0) resolve({ success: true, outputPath });
                    else resolve({ success: false, error: `FFmpeg failed with code ${code}` });
                },
                (err) => resolve({ success: false, error: err.message })
            );
        });
    }

}

module.exports = new FFmpegService();
