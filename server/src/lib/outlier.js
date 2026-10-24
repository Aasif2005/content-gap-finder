import { config } from '../config.js';
import { classifyFormula } from './hookFormulas.js';

// Raw views rank channel size, not ideas: a 400k video on a channel whose median
// is 30k is the thing worth studying, the same video on a 2M-sub channel is a
// normal Tuesday. Port of youtube-agent-skill's swipe.py (MIT, see data/NOTICE).

export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * A video's views as a multiple of its own channel's median, or null when there
 * is not enough baseline to mean anything. A median off one or two videos is
 * not a median, so below minBaseline this declines rather than ranking on noise.
 * Shorts and long-form are never mixed: a channel's Shorts median says nothing
 * about how a long video should perform.
 */
export function medianMultiple(video, baselineVideos, { minBaseline = config.outlier.minBaseline } = {}) {
  const peers = baselineVideos.filter((b) => b.isShort === video.isShort);
  if (peers.length < minBaseline) return null;
  const med = median(peers.map((b) => b.views));
  if (med <= 0) return null;
  return { multiple: Math.round((video.views / med) * 100) / 100, median: Math.round(med), baseline: peers.length };
}

/**
 * Tags every ranked video with its title formula, and the ones whose channel has
 * a usable baseline with their median multiple. Mutates the videos (the pipeline
 * already treats `ranked` as its working set). Returns the run-level summary:
 * how many were measured, which channels had too little history, and which
 * formulas the real outliers share (a pattern across channels, not within one).
 */
export function annotateOutliers(ranked, baselineByChannel, { threshold = config.outlier.threshold } = {}) {
  const measuredChannels = new Set();
  const thinChannels = new Map();
  const counts = new Map();

  for (const v of ranked) {
    v.formula = classifyFormula(v.title);
    const baseline = baselineByChannel.get(v.channelId);
    if (!baseline) continue;
    v.outlier = medianMultiple(v, baseline);
    if (v.outlier) {
      measuredChannels.add(v.channelId);
      if (v.outlier.multiple >= threshold && v.formula.id) {
        counts.set(v.formula.name, (counts.get(v.formula.name) ?? 0) + 1);
      }
    } else if (!measuredChannels.has(v.channelId)) {
      thinChannels.set(v.channelId, v.channelTitle);
    }
  }
  for (const id of measuredChannels) thinChannels.delete(id);

  return {
    measured: ranked.filter((v) => v.outlier).length,
    outliers: ranked.filter((v) => v.outlier?.multiple >= threshold).length,
    channelsMeasured: measuredChannels.size,
    thinChannels: [...thinChannels.values()],
    topFormulas: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    threshold,
  };
}
