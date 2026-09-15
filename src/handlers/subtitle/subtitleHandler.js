/**
 * Subtitle Handler
 * Handles subtitle parsing, saving, and CSS-rendered burn-in export.
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { getFfmpegPath } = require('../../utils/binaries');
const SRTParser = require('./srtParser');
const CSSSubtitleRenderer = require('./cssSubtitleRenderer');

const { createProgressThrottler } = require('../../utils/progressThrottle');

let currentFfmpegProc = null;
let currentBurnController = null;

function createCancelledError() {
    const error = new Error('Subtitle burn cancelled by user');
    error.code = 'SUBTITLE_BURN_CANCELLED';
    return error;
}

function sanitizeWordTimings(words) {
    if (!Array.isArray(words) || words.length === 0) return [];
    return words
        .filter(Boolean)
        .map((word) => ({
            text: String(word.text || ''),
            start: Number(word.start ?? 0),
            end: Number(word.end ?? word.start ?? 0)
        }))
        .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
}

function sanitizeStyleForRender(style = {}) {
    const strokes = Array.isArray(style.strokes) ? style.strokes.filter(Boolean).map((stroke) => ({
        width: Number(stroke.width ?? 0),
        color: stroke.color || '#000000',
        opacity: Number(stroke.opacity ?? 100)
    })) : [];
    const shadows = Array.isArray(style.shadows) ? style.shadows.filter(Boolean).map((shadow) => ({
        x: Number(shadow.x ?? 0),
        y: Number(shadow.y ?? 0),
        blur: Number(shadow.blur ?? 0),
        color: shadow.color || '#000000'
    })) : [];

    return {
        fontFamily: style.fontFamily || 'Arial',
        fontSize: Number(style.fontSize ?? 32),
        fontBold: !!style.fontBold,
        fontItalic: !!style.fontItalic,
        fontColor: style.fontColor || '#ffffff',
        lineHeight: Number(style.lineHeight ?? 1.4),
        letterSpacing: Number(style.letterSpacing ?? 0),
        position: style.position || '2',
        marginV: Number(style.marginV ?? 10),
        marginH: Number(style.marginH ?? 50),
        wrapWidth: Number(style.wrapWidth ?? 90),
        textAlign: style.textAlign || 'center',
        enableBackground: !!style.enableBackground,
        bgColor: style.bgColor || '#000000',
        bgOpacity: Number(style.bgOpacity ?? 50),
        strokes,
        shadows,
        animation: style.animation || 'none',
        animationDuration: Number(style.animationDuration ?? 300),
        enableKaraoke: !!style.enableKaraoke,
        karaokeStyle: style.karaokeStyle || 'highlight',
        karaokeColor: style.karaokeColor || '#3d6eb8'
    };
}

function sanitizeTracksForRender(tracks = []) {
    return tracks.map((track) => {
        const style = sanitizeStyleForRender(track.style || {});
        const keepWordTimings = !!style.enableKaraoke || style.animation === 'karaoke';

        return {
            id: track.id,
            type: track.type,
            style,
            subtitles: (Array.isArray(track.subtitles) ? track.subtitles : []).map((sub, index) => ({
                id: sub.id || `${track.id || 'track'}_${index}`,
                start: Number(sub.start ?? 0),
                end: Number(sub.end ?? sub.start ?? 0),
                text: String(sub.text || ''),
                karaokeText: String(sub.karaokeText || sub.text || ''),
                karaokeSecondaryText: String(sub.karaokeSecondaryText || ''),
                words: keepWordTimings ? sanitizeWordTimings(sub.words) : []
            }))
        };
    });
}

function normalizeSourceSegments(segments = []) {
    if (!Array.isArray(segments)) return [];

    const inferredDuration = segments.reduce((maxValue, segment) => {
        return Math.max(maxValue, Number(segment?.end || 0));
    }, 0);

    return segments
        .filter(Boolean)
        .map((segment) => ({
            start: Math.max(0, Math.min(inferredDuration, Number(segment.start || 0))),
            end: Math.max(0, Math.min(inferredDuration, Number(segment.end || 0)))
        }))
        .filter((segment) => segment.end - segment.start >= 0.01)
        .sort((left, right) => left.start - right.start);
}

function hasTrimmedSourceSegments(segments = [], duration = 0) {
    if (!segments.length) return false;
    if (segments.length !== 1) return true;

    const first = segments[0];
    return Math.abs((first.start || 0) - 0) > 0.01
        || Math.abs((first.end || 0) - Number(duration || 0)) > 0.01;
}

function runTrimCommand(args, controller) {
    return new Promise((resolve, reject) => {
        if (controller?.cancelled) return reject(createCancelledError());

        const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
        if (controller) controller.trimFfmpegProc = proc;
        let stderr = '';

        proc.stderr.on('data', (data) => {
            stderr = (stderr + data.toString()).slice(-5000);
        });
        proc.on('close', (code) => {
            if (controller?.trimFfmpegProc === proc) controller.trimFfmpegProc = null;
            if (controller?.cancelled) return reject(createCancelledError());
            if (code === 0) return resolve();
            reject(new Error(`FFmpeg source trim failed with code ${code}: ${stderr.trim()}`));
        });
        proc.on('error', (error) => {
            if (controller?.trimFfmpegProc === proc) controller.trimFfmpegProc = null;
            reject(controller?.cancelled ? createCancelledError() : error);
        });
    });
}

async function prepareTrimmedSourceMedia(event, params, tempFiles = [], controller = null) {
    const sourceSegments = normalizeSourceSegments(params.sourceSegments);
    if (!hasTrimmedSourceSegments(sourceSegments, params.sourceDuration || params.duration || 0)) {
        return {
            videoPath: params.videoPath,
            duration: Number(params.duration || 0),
            usedTrimmedSource: false
        };
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mediaflow-subtitle-trim-'));
    tempFiles.push(tempDir);
    const trimmedOutputPath = path.join(tempDir, 'trimmed_source.mp4');
    const segmentPaths = [];
    let duration = 0;
    const includeAudio = params.exportType !== 'video_only'
        && params.ttsSettings?.audioMode !== 'mute';

    for (const [index, segment] of sourceSegments.entries()) {
        const segmentPath = path.join(tempDir, `segment_${index}.mp4`);
        const segmentDuration = segment.end - segment.start;
        segmentPaths.push(segmentPath);
        duration += segmentDuration;
        const trimArgs = [
            '-y', '-i', params.videoPath,
            '-ss', String(segment.start), '-t', String(segmentDuration),
            '-map', '0:v:0',
            ...(includeAudio ? ['-map', '0:a?'] : []),
            '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
            ...(includeAudio ? ['-c:a', 'aac'] : []),
            '-movflags', '+faststart',
            segmentPath
        ];
        await runTrimCommand(trimArgs, controller);
        safeSendToRenderer(event, 'subtitle:burn-progress', 2 + Math.round(((index + 1) / sourceSegments.length) * 23));
    }

    const concatListPath = path.join(tempDir, 'concat.txt');
    const concatList = segmentPaths
        .map((filePath) => `file '${filePath.replace(/\\/g, '/').replace(/'/g, String.raw`'\''`)}'`)
        .join('\n');
    await fs.promises.writeFile(concatListPath, concatList, 'utf8');
    await runTrimCommand([
        '-y', '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-c', 'copy', '-movflags', '+faststart', trimmedOutputPath
    ], controller);
    safeSendToRenderer(event, 'subtitle:burn-progress', 30);

    return {
        videoPath: trimmedOutputPath,
        duration,
        usedTrimmedSource: true
    };
}

function safeSendToRenderer(event, channel, payload) {
    try {
        const sender = event?.sender;
        if (!sender || sender.isDestroyed?.() || sender.isCrashed?.()) return false;
        sender.send(channel, payload);
        return true;
    } catch (error) {
        console.warn(`[SubtitleHandler] Failed to send ${channel}:`, error?.message || error);
        return false;
    }
}

function cleanupTempFiles(paths = []) {
    paths.forEach((targetPath) => {
        if (!targetPath) return;
        fs.promises.lstat(targetPath)
            .then((stats) => {
                if (stats.isDirectory()) {
                    return fs.promises.rm(targetPath, { recursive: true, force: true });
                }
                return fs.promises.unlink(targetPath).catch(() => { });
            })
            .catch(() => { });
    });
}

function setupSubtitleHandlers() {
    ipcMain.handle('subtitle:select-video', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }]
        });
        if (canceled) return null;
        return filePaths[0];
    });

    ipcMain.handle('subtitle:parse-srt', async (event, filePath) => {
        try {
            return await SRTParser.readFile(filePath);
        } catch (error) {
            console.error('Failed to parse SRT:', error);
            throw error;
        }
    });

    ipcMain.handle('subtitle:save-srt', async (event, { filePath, subtitles }) => {
        try {
            return await SRTParser.saveFile(filePath, subtitles);
        } catch (error) {
            console.error('Failed to save SRT:', error);
            throw error;
        }
    });

    ipcMain.handle('subtitle:burn', async (event, params) => {
        const {
            tracks,
            subtitles,
            style,
            outputPath,
            width,
            height
        } = params;

        const tempFiles = [];

        try {
            let cancelReject = null;
            const cancelPromise = new Promise((_, reject) => {
                cancelReject = reject;
            });
            cancelPromise.catch(() => {});
            currentBurnController = {
                cancelled: false,
                rendererWindow: null,
                renderFfmpegProc: null,
                trimFfmpegProc: null,
                cancelPromise,
                cancelReject
            };
            safeSendToRenderer(event, 'subtitle:burn-progress', 1);
            let tracksToBurn = tracks;
            if ((!tracks || tracks.length === 0) && subtitles && style) {
                tracksToBurn = [{ id: 1, subtitles, style }];
            }

            if (!tracksToBurn || tracksToBurn.length === 0) {
                throw new Error('No subtitle tracks provided');
            }

            tracksToBurn = sanitizeTracksForRender(tracksToBurn);
            safeSendToRenderer(event, 'subtitle:burn-progress', 2);

            const preparedSource = await prepareTrimmedSourceMedia(event, params, tempFiles, currentBurnController);

            const videoInfo = {
                width: width || 1920,
                height: height || 1080
            };
            const totalDuration = Math.max(
                Number(preparedSource.duration || params.duration || 0),
                ...tracksToBurn.flatMap(track => (track.subtitles || []).map(sub => Number(sub.end || 0)))
            );
            const ffmpegPath = getFfmpegPath();
            const overlayProgressBase = preparedSource.usedTrimmedSource ? 30 : 2;
            const overlayProgressSpan = preparedSource.usedTrimmedSource ? 45 : 73;

            const overlayResult = await CSSSubtitleRenderer.renderOverlayVideo({
                tracks: tracksToBurn,
                width: videoInfo.width,
                height: videoInfo.height,
                duration: totalDuration,
                ffmpegPath,
                progressCallback: (percent) => {
                    const mapped = Math.max(
                        overlayProgressBase,
                        Math.min(75, overlayProgressBase + Math.round((Math.max(0, Math.min(100, percent)) / 100) * overlayProgressSpan))
                    );
                    safeSendToRenderer(event, 'subtitle:burn-progress', mapped);
                },
                controller: currentBurnController
            });
            tempFiles.push(...(overlayResult.cleanupPaths || []));

            const fp = [];
            let currentInput = '[0:v]';

            if (params.isMirrored) {
                fp.push(`${currentInput}hflip[v_mirrored]`);
                currentInput = '[v_mirrored]';
            }

            if (params.cropSettings) {
                const cs = params.cropSettings;
                if (cs.mode === 'ratio') {
                    fp.push(`${currentInput}crop=w='min(iw,ih*${cs.w}/${cs.h})':h='min(ih,iw*${cs.h}/${cs.w})'[v_cropped]`);
                    currentInput = '[v_cropped]';
                } else if (cs.mode === 'custom') {
                    const wExpr = `iw*${parseFloat(cs.w) / 100}`;
                    const hExpr = `ih*${parseFloat(cs.h) / 100}`;
                    const xExpr = `iw*${parseFloat(cs.x) / 100}`;
                    const yExpr = `ih*${parseFloat(cs.y) / 100}`;
                    fp.push(`${currentInput}crop=${wExpr}:${hExpr}:${xExpr}:${yExpr}[v_cropped]`);
                    currentInput = '[v_cropped]';
                }
            }

            const masks = Array.isArray(params.blurMasks) ? [...params.blurMasks] : [];
            if (masks.length === 0 && params.blurSettings) {
                const { position, height: maskHeight, strength, yOffset } = params.blurSettings;
                if (strength > 0) {
                    let y = 85;
                    if (position === 'top') y = 10;
                    else if (position === 'center') y = 50;
                    else if (yOffset !== undefined) y = yOffset;

                    masks.push({
                        y,
                        height: maskHeight || 15,
                        strength: strength || 10
                    });
                }
            }

            masks.forEach((mask, index) => {
                const hPercent = Math.min(1, (mask.height || 10) / 100);
                const sigma = mask.strength || 10;
                const yCenter = (mask.y !== undefined ? mask.y : 80) / 100;
                let yTop = Math.max(0, yCenter - (hPercent / 2));
                if (yTop + hPercent > 1) yTop = 1 - hPercent;

                const blurredId = `blurred${index}`;
                const outId = `v_blur_${index}`;
                const vHeight = videoInfo.height;
                const hVal = Math.max(2, Math.floor(vHeight * hPercent / 2) * 2);
                const yVal = Math.floor(vHeight * yTop / 2) * 2;
                const sigmaFixed = Math.max(1, Math.min(50, sigma));

                fp.push(`${currentInput}split[main_${index}][to_crop_${index}]`);
                fp.push(`[to_crop_${index}]crop=iw:${hVal}:0:${yVal},boxblur=${sigmaFixed}:2[${blurredId}]`);
                fp.push(`[main_${index}][${blurredId}]overlay=0:${yVal}[${outId}]`);
                currentInput = `[${outId}]`;
            });

            const overlayInputIndex = 1;
            let overlayStreamLabel = `[${overlayInputIndex}:v]`;
            if (
                overlayResult.renderWidth && overlayResult.renderHeight &&
                (overlayResult.renderWidth !== videoInfo.width || overlayResult.renderHeight !== videoInfo.height)
            ) {
                fp.push(`${overlayStreamLabel}scale=${videoInfo.width}:${videoInfo.height}:flags=lanczos[subtitle_overlay_scaled]`);
                overlayStreamLabel = '[subtitle_overlay_scaled]';
            }
            fp.push(`${currentInput}${overlayStreamLabel}overlay=0:0:format=auto,format=yuv420p[out_v]`);

            const muteAudio = params.exportType === 'video_only'
                || params.ttsSettings?.audioMode === 'mute';
            let audioMap = muteAudio ? [] : ['-map', '0:a?'];
            let audioCodec = muteAudio ? [] : ['-c:a', 'copy'];
            let ttsInput = [];
            const ttsInputIndex = 2;

            if (params.ttsSettings && params.ttsSettings.enabled && params.ttsSettings.audioPath) {
                ttsInput = ['-i', params.ttsSettings.audioPath];
                const ttsAudioStream = `[${ttsInputIndex}:a]`;
                const voiceVol = params.ttsSettings.voiceVolume !== undefined ? params.ttsSettings.voiceVolume : 0.8;
                const bgmVol = params.ttsSettings.bgmVolume !== undefined ? params.ttsSettings.bgmVolume : 0.3;

                if (params.ttsSettings.audioMode === 'remove') {
                    fp.push(`${ttsAudioStream}volume=${voiceVol}[out_a]`);
                    audioMap = ['-map', '[out_a]'];
                    audioCodec = ['-c:a', 'aac'];
                } else {
                    fp.push('[0:a]volume=1.0[bg_raw]');
                    fp.push(`${ttsAudioStream}volume=${voiceVol}[fg]`);
                    const duckingRatio = Math.max(2, 1 / (bgmVol || 0.1));
                    fp.push(`[bg_raw][fg]asidechaincompress=threshold=0.1:ratio=${duckingRatio}:attack=50:release=300[out_a]`);
                    audioMap = ['-map', '[out_a]'];
                    audioCodec = ['-c:a', 'aac'];
                }
            }

            const args = [
                '-i', preparedSource.videoPath,
                '-i', overlayResult.overlayPath,
                ...ttsInput,
                '-filter_complex', fp.join(';'),
                '-map', '[out_v]',
                ...audioMap,
                '-c:v', 'libx264',
                '-profile:v', 'high',
                '-pix_fmt', 'yuv420p',
                ...audioCodec,
                '-preset', 'fast',
                '-movflags', '+faststart',
                '-y',
                outputPath
            ];

            console.log('[SubtitleHandler] Executing FFmpeg Command:');
            console.log(`"${ffmpegPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

            return await new Promise((resolve, reject) => {
                currentFfmpegProc = spawn(ffmpegPath, args, { windowsHide: true });
                let lastErrorOutput = '';
                let lastBurnPercent = -1;
                const burnProgress = createProgressThrottler((payload) => {
                    const value = typeof payload === 'number' ? payload : payload?.progress;
                    if (typeof value === 'number') {
                        safeSendToRenderer(event, 'subtitle:burn-progress', value);
                    }
                }, { minIntervalMs: 250 });

                currentFfmpegProc.stderr.on('data', (data) => {
                    const output = data.toString();
                    lastErrorOutput += output;
                    if (lastErrorOutput.length > 5000) {
                        lastErrorOutput = lastErrorOutput.substring(lastErrorOutput.length - 5000);
                    }

                    const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                    if (timeMatch && totalDuration > 0) {
                        const timeStr = timeMatch[1];
                        const parts = timeStr.split(':');
                        const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
                        const percent = Math.min(100, 75 + Math.round((seconds / totalDuration) * 25));
                        if (percent > lastBurnPercent) {
                            lastBurnPercent = percent;
                            burnProgress.send({ progress: percent }, percent >= 100);
                        }
                    }
                    // Avoid logging every stderr chunk (floods console during long burns)
                });

                currentFfmpegProc.on('close', (code) => {
                    cleanupTempFiles(tempFiles);
                    currentFfmpegProc = null;
                    if (currentBurnController?.cancelled) {
                        currentBurnController = null;
                        reject(createCancelledError());
                        return;
                    }
                    currentBurnController = null;
                    if (code === 0) {
                        burnProgress.send({ progress: 100 }, true);
                        resolve({ success: true, outputPath });
                        return;
                    }

                    const details = lastErrorOutput
                        .split('\n')
                        .filter(line => line.trim())
                        .slice(-10)
                        .join('\n');
                    reject(new Error(`FFmpeg exited with code ${code}.\nDetails:\n${details}`));
                });

                currentFfmpegProc.on('error', (err) => {
                    cleanupTempFiles(tempFiles);
                    currentFfmpegProc = null;
                    if (currentBurnController?.cancelled) {
                        currentBurnController = null;
                        reject(createCancelledError());
                        return;
                    }
                    currentBurnController = null;
                    reject(err);
                });
            });
        } catch (error) {
            console.error('[SubtitleHandler] Burn error:', error);
            cleanupTempFiles(tempFiles);
            currentBurnController = null;
            throw error;
        }
    });

    ipcMain.handle('subtitle:cancel', () => {
        let cancelled = false;
        if (currentBurnController) {
            currentBurnController.cancelled = true;
            if (currentBurnController.cancelReject) {
                currentBurnController.cancelReject(createCancelledError());
                currentBurnController.cancelReject = null;
            }
            cancelled = true;
            if (currentBurnController.trimFfmpegProc) {
                currentBurnController.trimFfmpegProc.kill();
                currentBurnController.trimFfmpegProc = null;
            }
            if (currentBurnController.rendererWindow && !currentBurnController.rendererWindow.isDestroyed()) {
                currentBurnController.rendererWindow.destroy();
            }
            if (currentBurnController.renderFfmpegProc) {
                currentBurnController.renderFfmpegProc.kill();
                currentBurnController.renderFfmpegProc = null;
            }
        }
        if (currentFfmpegProc) {
            currentFfmpegProc.kill();
            currentFfmpegProc = null;
            cancelled = true;
        }
        return cancelled;
    });

    ipcMain.handle('subtitle:get-video-info', async (event, videoPath) => {
        const { spawn: spawnChild } = require('child_process');
        const { getFfprobePath } = require('../../utils/binaries');
        const ffprobePath = getFfprobePath();

        return new Promise((resolve, reject) => {
            const args = [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height:format=duration',
                '-of', 'json',
                videoPath
            ];

            console.log(`[SubtitleHandler] Executing FFprobe: ${ffprobePath} ${args.join(' ')}`);

            const proc = spawnChild(ffprobePath, args);
            let output = '';
            proc.stdout.on('data', (data) => {
                output += data;
            });
            proc.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`ffprobe failed with code ${code}`));
                    return;
                }

                try {
                    const data = JSON.parse(output);
                    const stream = data.streams?.[0] || {};
                    const format = data.format || {};
                    resolve({
                        width: stream.width,
                        height: stream.height,
                        duration: parseFloat(format.duration)
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    console.log('[Main] Subtitle handlers setup');
}

module.exports = { setupSubtitleHandlers };
