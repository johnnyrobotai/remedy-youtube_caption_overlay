/**
 * @file
 * WebVTT caption file parser.
 */

(function (Drupal) {

  'use strict';

  Drupal.youtubeCaptionOverlay = Drupal.youtubeCaptionOverlay || {};

  /**
   * Parses a VTT timestamp into seconds.
   *
   * Accepts MM:SS.mmm or HH:MM:SS.mmm format.
   *
   * @param {string} timestamp
   *   VTT timestamp string.
   *
   * @return {number}
   *   Time in seconds.
   */
  function parseTimestamp(timestamp) {
    var parts = timestamp.trim().split(':');
    if (parts.length === 2) {
      // MM:SS.mmm
      var minutes = parseFloat(parts[0]) || 0;
      var seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    // HH:MM:SS.mmm
    var hours = parseFloat(parts[0]) || 0;
    var mins = parseFloat(parts[1]) || 0;
    var secs = parseFloat(parts[2]) || 0;
    return hours * 3600 + mins * 60 + secs;
  }

  /**
   * Strips VTT tags from caption text.
   *
   * Removes tags like <v Speaker>, <c.classname>, <b>, <i>, etc.
   *
   * @param {string} text
   *   Caption text that may contain VTT tags.
   *
   * @return {string}
   *   Clean text without VTT tags.
   */
  function stripVttTags(text) {
    return text.replace(/<\/?[^>]+>/g, '');
  }

  /**
   * Parses VTT content into an array of cue objects.
   *
   * @param {string} vttContent
   *   Raw VTT file content.
   *
   * @return {Array<{start: number, end: number, text: string}>}
   *   Array of cue objects sorted by start time.
   */
  Drupal.youtubeCaptionOverlay.parseVTT = function (vttContent) {
    var cues = [];

    // Normalize line endings.
    var content = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Strip WEBVTT header and any metadata before the first blank line.
    var headerEnd = content.indexOf('\n\n');
    if (headerEnd !== -1) {
      content = content.substring(headerEnd + 2);
    }

    // Split into blocks by double newlines.
    var blocks = content.split(/\n\n+/);

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].trim();
      if (!block) {
        continue;
      }

      var lines = block.split('\n');

      // Find the line containing the timestamp arrow.
      var timestampLineIndex = -1;
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].indexOf('-->') !== -1) {
          timestampLineIndex = j;
          break;
        }
      }

      if (timestampLineIndex === -1) {
        continue;
      }

      // Parse timestamps. The timestamp line may have positioning info after
      // the end time (e.g., "00:00:05.000 --> 00:00:08.500 position:50%").
      var timestampLine = lines[timestampLineIndex];
      var arrowIndex = timestampLine.indexOf('-->');
      var startStr = timestampLine.substring(0, arrowIndex).trim();
      var afterArrow = timestampLine.substring(arrowIndex + 3).trim();

      // The end timestamp is the first space-delimited token after the arrow,
      // or the entire remaining string if there are no positioning settings.
      var endParts = afterArrow.split(/\s+/);
      var endStr = endParts[0];

      var start = parseTimestamp(startStr);
      var end = parseTimestamp(endStr);

      // Everything after the timestamp line is caption text.
      var textLines = lines.slice(timestampLineIndex + 1);
      var text = stripVttTags(textLines.join('\n').trim());

      if (text) {
        cues.push({
          start: start,
          end: end,
          text: text
        });
      }
    }

    // Sort by start time.
    cues.sort(function (a, b) {
      return a.start - b.start;
    });

    return cues;
  };

})(Drupal);
