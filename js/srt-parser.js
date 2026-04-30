/**
 * @file
 * SRT (SubRip) caption file parser.
 */

(function (Drupal) {

  'use strict';

  Drupal.youtubeCaptionOverlay = Drupal.youtubeCaptionOverlay || {};

  /**
   * Parses an SRT timestamp into seconds.
   *
   * @param {string} timestamp
   *   Timestamp in format HH:MM:SS,mmm or HH:MM:SS.mmm.
   *
   * @return {number}
   *   Time in seconds.
   */
  function parseTimestamp(timestamp) {
    // Accept both comma and period as millisecond separator.
    var parts = timestamp.trim().replace(',', '.').split(':');
    var hours = parseFloat(parts[0]) || 0;
    var minutes = parseFloat(parts[1]) || 0;
    var seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Parses SRT content into an array of cue objects.
   *
   * @param {string} srtContent
   *   Raw SRT file content.
   *
   * @return {Array<{start: number, end: number, text: string}>}
   *   Array of cue objects sorted by start time.
   */
  Drupal.youtubeCaptionOverlay.parseSRT = function (srtContent) {
    var cues = [];

    // Normalize line endings.
    var content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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

      // Parse timestamps.
      var timeParts = lines[timestampLineIndex].split('-->');
      if (timeParts.length < 2) {
        continue;
      }

      var start = parseTimestamp(timeParts[0]);
      var end = parseTimestamp(timeParts[1]);

      // Everything after the timestamp line is caption text.
      var textLines = lines.slice(timestampLineIndex + 1);
      var text = textLines.join('\n').trim();

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
