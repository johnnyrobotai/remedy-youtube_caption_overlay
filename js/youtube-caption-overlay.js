/**
 * @file
 * Remedy YouTube Caption Overlay main behavior.
 *
 * Scans the page for YouTube iframes matching video IDs from the
 * caption overlay field, wraps them with caption display containers,
 * and synchronizes caption text during playback.
 *
 * Supports two embed patterns:
 * 1. Direct YouTube iframes in the page DOM.
 * 2. Drupal Media oEmbed proxy iframes inside Bootstrap modals/lightboxes
 *    (as used by LACCD/lamission.edu). These are detected when the modal
 *    opens, the oEmbed proxy is replaced with a direct YouTube embed,
 *    and captions are overlaid inside the modal.
 */

(function (Drupal, once) {

  'use strict';

  /**
   * Counter for generating unique iframe IDs.
   */
  var iframeIdCounter = 0;

  /**
   * Whether the YouTube IFrame API has been loaded and is ready.
   */
  var ytApiReady = false;

  /**
   * Queue of functions to call once the YT API is ready.
   */
  var ytApiQueue = [];

  /**
   * Whether this behavior has attached its YouTube API ready callback.
   */
  var ytApiCallbackAttached = false;

  /**
   * Registry of caption configs keyed by video ID.
   * Built from formatter wrappers and legacy .yco-data elements on the page.
   */
  var captionRegistry = {};

  /**
   * Whether the modal observer has been initialized.
   */
  var modalObserverInitialized = false;

  /**
   * Escapes HTML special characters to prevent XSS.
   *
   * @param {string} text
   *   Raw text.
   *
   * @return {string}
   *   HTML-escaped text.
   */
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  /**
   * Loads the YouTube IFrame API if not already loaded.
   */
  function loadYouTubeApi() {
    // Already loaded and ready.
    if (window.YT && window.YT.Player) {
      ytApiReady = true;
      processQueue();
      return;
    }

    if (!ytApiCallbackAttached) {
      // Preserve any existing callback, including one registered by another
      // module before this behavior attaches.
      var existingCallback = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = function () {
        ytApiReady = true;
        if (typeof existingCallback === 'function') {
          existingCallback();
        }
        processQueue();
      };
      ytApiCallbackAttached = true;
    }

    // Already loading via another component; the callback above will run when
    // the API reports ready.
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      return;
    }

    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    var firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(tag, firstScript);
    }
    else {
      document.head.appendChild(tag);
    }
  }

  /**
   * Processes the queue of pending initializations.
   */
  function processQueue() {
    while (ytApiQueue.length > 0) {
      var fn = ytApiQueue.shift();
      fn();
    }
  }

  /**
   * Ensures an iframe has enablejsapi=1 and origin parameters.
   *
   * @param {HTMLIFrameElement} iframe
   *   The YouTube iframe element.
   */
  function ensureApiParams(iframe) {
    var src = iframe.getAttribute('src') || iframe.src;
    if (!src) {
      return;
    }

    try {
      var url = new URL(src, window.location.href);
      var modified = false;

      if (url.searchParams.get('enablejsapi') !== '1') {
        url.searchParams.set('enablejsapi', '1');
        modified = true;
      }

      if (!url.searchParams.has('origin')) {
        url.searchParams.set('origin', window.location.origin);
        modified = true;
      }

      // Disable YouTube's native fullscreen button so users do not enter an
      // iframe-only fullscreen state that hides the external caption overlay.
      if (url.searchParams.get('fs') !== '0') {
        url.searchParams.set('fs', '0');
        modified = true;
      }

      if (modified) {
        iframe.src = url.toString();
      }
    }
    catch (e) {
      var separator = src.indexOf('?') === -1 ? '?' : '&';
      iframe.src = src + separator + 'enablejsapi=1&fs=0&origin=' +
        encodeURIComponent(window.location.origin);
    }
  }

  /**
   * Finds direct YouTube iframes on the page matching a video ID.
   *
   * @param {string} videoId
   *   The YouTube video ID to search for.
   *
   * @return {Array<HTMLIFrameElement>}
   *   Array of matching iframes.
   */
  function findIframes(videoId) {
    var iframes = document.querySelectorAll('iframe');
    var matches = [];

    for (var i = 0; i < iframes.length; i++) {
      var src = iframes[i].src || '';
      if (extractVideoId(src) === videoId) {
        // Skip if already wrapped.
        if (!iframes[i].closest('.yco-container')) {
          matches.push(iframes[i]);
        }
      }
    }

    return matches;
  }

  /**
   * Extracts a YouTube video ID from various URL formats.
   *
   * Handles:
   * - youtube.com/watch?v=VIDEO_ID
   * - youtube.com/embed/VIDEO_ID
   * - youtube.com/shorts/VIDEO_ID
   * - youtu.be/VIDEO_ID
   * - oEmbed proxy URLs containing encoded YouTube URLs
   *
   * @param {string} url
   *   The URL to extract from.
   *
   * @return {string|null}
   *   The video ID or null if not found.
   */
  function extractVideoId(url) {
    if (!url) {
      return null;
    }

    try {
      var parsedUrl = new URL(url, window.location.href);
      var embeddedUrl = parsedUrl.searchParams.get('url');
      if (embeddedUrl) {
        return extractVideoId(embeddedUrl);
      }

      var hostname = parsedUrl.hostname.replace(/^www\./, '');
      if (hostname === 'youtu.be') {
        var shortMatch = parsedUrl.pathname.match(/^\/([a-zA-Z0-9_-]{11})/);
        return shortMatch ? shortMatch[1] : null;
      }

      if (hostname === 'youtube.com' ||
          hostname === 'm.youtube.com' ||
          hostname === 'youtube-nocookie.com') {
        var watchId = parsedUrl.searchParams.get('v');
        if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) {
          return watchId;
        }

        var pathMatch = parsedUrl.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
        if (pathMatch) {
          return pathMatch[1];
        }
      }
    }
    catch (e) {
      // Fall back to regex extraction below for malformed or encoded strings.
    }

    // Check for oEmbed proxy URL containing encoded YouTube URL.
    var oembedMatch = url.match(/[?&]url=([^&]+)/);
    if (oembedMatch) {
      var decodedUrl = decodeURIComponent(oembedMatch[1]);
      return extractVideoId(decodedUrl);
    }

    // Standard watch URL: youtube.com/watch?v=VIDEO_ID
    var watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      return watchMatch[1];
    }

    // Embed URL: youtube.com/embed/VIDEO_ID
    var embedMatch = url.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }

    // Short URL: youtu.be/VIDEO_ID
    var shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortUrlMatch) {
      return shortUrlMatch[1];
    }

    // Shorts/live URLs.
    var pathUrlMatch = url.match(/youtube(?:-nocookie)?\.com\/(?:shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (pathUrlMatch) {
      return pathUrlMatch[1];
    }

    return null;
  }

  /**
   * Formats seconds into a timestamp string (MM:SS).
   *
   * @param {number} seconds
   *   Time in seconds.
   *
   * @return {string}
   *   Formatted timestamp.
   */
  function formatTimestamp(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  /**
   * Checks whether the user prefers reduced motion.
   *
   * @return {boolean}
   *   TRUE if smooth scrolling and transitions should be avoided.
   */
  function prefersReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Creates the caption overlay DOM structure around an iframe.
   *
   * @param {HTMLIFrameElement} iframe
   *   The YouTube iframe to wrap.
   * @param {object} config
   *   Configuration from the data attributes.
   * @param {object} options
   *   Optional settings.
   * @param {boolean} options.inModal
   *   Whether this iframe is inside a modal dialog.
   *
   * @return {object}
   *   Object with references to created DOM elements.
   */
  function wrapIframe(iframe, config, options) {
    options = options || {};

    // Check if the iframe is already inside the formatter-rendered structure.
    var responsiveWrapper = iframe.closest('.yco-responsive-wrapper');
    var fieldWrapper = iframe.closest('.yco-field-wrapper');
    var iframeParent = iframe.parentElement;
    var useModalParent = options.inModal && iframeParent && (
      iframeParent.classList.contains('ratio') ||
      iframeParent.classList.contains('embed-responsive') ||
      iframeParent.children.length === 1
    );
    var container;
    var playerRoot;

    if (responsiveWrapper && fieldWrapper) {
      // Field-rendered iframe: keep the responsive wrapper as the video frame
      // and use the field wrapper as the outer player shell.
      container = responsiveWrapper;
      container.classList.add('yco-container');
      playerRoot = fieldWrapper;
      playerRoot.classList.add('yco-player');
      if (options.inModal) {
        container.classList.add('yco-container--modal');
        playerRoot.classList.add('yco-player--modal');
      }
    }
    else if (useModalParent) {
      // Modal iframe: use the ratio wrapper as the video frame and wrap it in
      // a player shell so fullscreen includes captions and controls.
      container = iframeParent;
      container.classList.add('yco-container');
      container.classList.add('yco-container--modal');
      playerRoot = container.closest('.yco-player');
      if (!playerRoot) {
        playerRoot = document.createElement('div');
        playerRoot.className = 'yco-player yco-player--modal';
        container.parentNode.insertBefore(playerRoot, container);
        playerRoot.appendChild(container);
      }
      else {
        playerRoot.classList.add('yco-player--modal');
      }
    }
    else {
      // Legacy path: iframe was embedded separately (for example in a body
      // field). Create both an outer player shell and an inner video frame.
      playerRoot = document.createElement('div');
      playerRoot.className = 'yco-player';
      container = document.createElement('div');
      container.className = 'yco-container';
      if (options.inModal) {
        container.classList.add('yco-container--modal');
        playerRoot.classList.add('yco-player--modal');
      }
      iframe.parentNode.insertBefore(playerRoot, iframe);
      playerRoot.appendChild(container);
      container.appendChild(iframe);
    }

    // Apply custom properties.
    playerRoot.style.setProperty('--yco-font-size', config.fontSize);
    playerRoot.style.setProperty('--yco-background', config.background);
    playerRoot.style.setProperty('--yco-color', config.color);

    // Create caption display overlay.
    var captionDisplay = document.createElement('div');
    captionDisplay.className = 'yco-caption-display';
    captionDisplay.setAttribute('aria-live', 'polite');
    captionDisplay.setAttribute('aria-atomic', 'true');
    captionDisplay.setAttribute('role', 'status');

    var captionText = document.createElement('span');
    captionText.className = 'yco-caption-text';
    captionDisplay.appendChild(captionText);
    container.appendChild(captionDisplay);

    // Create controls bar.
    var controls = document.createElement('div');
    controls.className = 'yco-controls';
    controls.setAttribute('aria-label', 'Caption controls');

    // CC toggle button.
    var ccToggle = document.createElement('button');
    ccToggle.className = 'yco-cc-toggle yco-cc-active';
    ccToggle.setAttribute('type', 'button');
    ccToggle.setAttribute('aria-pressed', 'true');
    ccToggle.setAttribute('aria-label', 'Toggle captions');
    ccToggle.setAttribute('aria-controls', iframe.id);
    ccToggle.textContent = 'CC';
    controls.appendChild(ccToggle);

    // Track caption visibility state.
    var captionsVisible = true;

    ccToggle.addEventListener('click', function () {
      captionsVisible = !captionsVisible;
      captionDisplay.style.visibility = captionsVisible ? 'visible' : 'hidden';
      ccToggle.setAttribute('aria-pressed', captionsVisible ? 'true' : 'false');
      ccToggle.classList.toggle('yco-cc-active', captionsVisible);
    });

    // Fullscreen button — fullscreens the player so captions stay visible.
    var fsButton = document.createElement('button');
    fsButton.className = 'yco-fs-toggle';
    fsButton.setAttribute('type', 'button');
    fsButton.setAttribute('aria-label', 'Toggle fullscreen');
    fsButton.setAttribute('aria-controls', iframe.id);
    fsButton.textContent = '⛶';
    controls.appendChild(fsButton);

    if (!document.fullscreenEnabled || !playerRoot.requestFullscreen) {
      fsButton.hidden = true;
    }
    else {
      fsButton.addEventListener('click', function () {
        var fullscreenPromise;
        if (document.fullscreenElement === playerRoot) {
          fullscreenPromise = document.exitFullscreen();
        }
        else {
          fullscreenPromise = playerRoot.requestFullscreen();
        }
        if (fullscreenPromise && fullscreenPromise.catch) {
          fullscreenPromise.catch(function () {
            // Browser denied fullscreen; leave the player in its current state.
          });
        }
      });
    }

    // Update button label when fullscreen changes.
    document.addEventListener('fullscreenchange', function () {
      if (document.fullscreenElement === playerRoot) {
        fsButton.textContent = '⛶';
        fsButton.setAttribute('aria-label', 'Exit fullscreen');
      }
      else {
        fsButton.textContent = '⛶';
        fsButton.setAttribute('aria-label', 'Toggle fullscreen');
      }
    });

    // Transcript panel (optional).
    var transcriptPanel = null;
    var transcriptToggle = null;

    if (config.showTranscript) {
      transcriptToggle = document.createElement('button');
      transcriptToggle.className = 'yco-transcript-toggle';
      transcriptToggle.setAttribute('type', 'button');
      transcriptToggle.setAttribute('aria-pressed', 'false');
      transcriptToggle.setAttribute('aria-expanded', 'false');
      transcriptToggle.setAttribute('aria-label', 'Toggle transcript');
      transcriptToggle.textContent = 'Transcript';
      controls.appendChild(transcriptToggle);

      transcriptPanel = document.createElement('div');
      transcriptPanel.className = 'yco-transcript';
      transcriptPanel.setAttribute('role', 'log');
      transcriptPanel.setAttribute('aria-label', 'Video transcript');
      transcriptPanel.hidden = true;

      transcriptToggle.addEventListener('click', function () {
        var isVisible = !transcriptPanel.hidden;
        transcriptPanel.hidden = isVisible;
        transcriptToggle.setAttribute('aria-pressed', isVisible ? 'false' : 'true');
        transcriptToggle.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
      });
    }

    playerRoot.appendChild(controls);

    if (transcriptPanel) {
      playerRoot.appendChild(transcriptPanel);
    }

    return {
      playerRoot: playerRoot,
      container: container,
      captionDisplay: captionDisplay,
      captionText: captionText,
      ccToggle: ccToggle,
      transcriptPanel: transcriptPanel,
      transcriptToggle: transcriptToggle
    };
  }

  /**
   * Builds the transcript panel from cues.
   *
   * @param {HTMLElement} panel
   *   The transcript panel element.
   * @param {Array} cues
   *   Array of caption cues.
   *
   * @return {Array<HTMLElement>}
   *   Array of cue elements for highlighting.
   */
  function buildTranscript(panel, cues) {
    var elements = [];

    for (var i = 0; i < cues.length; i++) {
      var cueEl = document.createElement('div');
      cueEl.className = 'yco-transcript-cue';

      var time = document.createElement('span');
      time.className = 'yco-transcript-time';
      time.textContent = formatTimestamp(cues[i].start);

      var text = document.createElement('span');
      text.className = 'yco-transcript-text';
      text.textContent = cues[i].text;

      cueEl.appendChild(time);
      cueEl.appendChild(text);
      panel.appendChild(cueEl);
      elements.push(cueEl);
    }

    return elements;
  }

  /**
   * Starts the caption sync loop for a player.
   *
   * @param {YT.Player} player
   *   The YouTube player instance.
   * @param {Array} cues
   *   Parsed caption cues.
   * @param {object} dom
   *   DOM references from wrapIframe().
   * @param {Array} transcriptElements
   *   Transcript cue elements (may be empty).
   */
  function startCaptionSync(player, cues, dom, transcriptElements) {
    var syncInterval = null;
    var currentCueIndex = -1;

    function clearSyncInterval() {
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
      if (dom.playerRoot) {
        dom.playerRoot.removeAttribute('data-yco-sync-id');
      }
      if (dom.container) {
        dom.container.removeAttribute('data-yco-sync-id');
      }
    }

    player.addEventListener('onStateChange', function (event) {
      if (event.data === YT.PlayerState.PLAYING) {
        clearSyncInterval();
        syncInterval = setInterval(function () {
          var currentTime = player.getCurrentTime();
          var foundIndex = -1;

          for (var i = 0; i < cues.length; i++) {
            if (currentTime >= cues[i].start && currentTime <= cues[i].end) {
              foundIndex = i;
              break;
            }
          }

          if (foundIndex !== currentCueIndex) {
            currentCueIndex = foundIndex;

            if (foundIndex >= 0) {
              dom.captionText.innerHTML = escapeHtml(cues[foundIndex].text).replace(/\n/g, '<br>');
            }
            else {
              dom.captionText.innerHTML = '';
            }

            if (transcriptElements.length > 0) {
              for (var j = 0; j < transcriptElements.length; j++) {
                transcriptElements[j].classList.remove('yco-transcript-active');
              }
              if (foundIndex >= 0 && transcriptElements[foundIndex]) {
                transcriptElements[foundIndex].classList.add('yco-transcript-active');
                transcriptElements[foundIndex].scrollIntoView({
                  behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                  block: 'center'
                });
              }
            }
          }
        }, 100);

        // Store interval ID on the DOM for modal cleanup.
        if (dom.playerRoot) {
          dom.playerRoot.setAttribute('data-yco-sync-id', syncInterval);
        }
        if (dom.container) {
          dom.container.setAttribute('data-yco-sync-id', syncInterval);
        }
      }
      else if (event.data === YT.PlayerState.PAUSED ||
               event.data === YT.PlayerState.ENDED) {
        clearSyncInterval();
      }
    });
  }

  /**
   * Fetches a caption file, parses it, and starts overlay sync.
   *
   * @param {HTMLIFrameElement} iframe
   *   The YouTube iframe (must already have an id and enablejsapi=1).
   * @param {object} config
   *   Caption config.
   * @param {object} dom
   *   DOM references from wrapIframe().
   */
  function fetchAndSync(iframe, config, dom) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', config.captionUrl, true);
    xhr.onload = function () {
      if (xhr.status !== 200) {
        return;
      }

      var cues;
      if (config.captionFormat === 'vtt') {
        cues = Drupal.youtubeCaptionOverlay.parseVTT(xhr.responseText);
      }
      else {
        cues = Drupal.youtubeCaptionOverlay.parseSRT(xhr.responseText);
      }

      if (!cues || cues.length === 0) {
        return;
      }

      var transcriptElements = [];
      if (dom.transcriptPanel) {
        transcriptElements = buildTranscript(dom.transcriptPanel, cues);
      }

      var player = new YT.Player(iframe.id, {
        events: {
          onReady: function () {
            startCaptionSync(player, cues, dom, transcriptElements);
          }
        }
      });
    };
    xhr.send();
  }

  /**
   * Initializes the caption overlay for a single iframe + config pair.
   *
   * @param {HTMLIFrameElement} iframe
   *   The YouTube iframe.
   * @param {object} config
   *   Configuration object.
   * @param {object} options
   *   Optional settings for wrapIframe.
   */
  function initOverlay(iframe, config, options) {
    ensureApiParams(iframe);

    if (!iframe.id) {
      iframe.id = 'yco-iframe-' + (++iframeIdCounter);
    }

    var dom = wrapIframe(iframe, config, options);
    fetchAndSync(iframe, config, dom);
  }

  // ---------------------------------------------------------------
  // oEmbed / Bootstrap Modal support
  // ---------------------------------------------------------------

  /**
   * Handles a Bootstrap modal that has just been shown.
   *
   * Checks if it contains an oEmbed proxy iframe or direct YouTube iframe for
   * a video that has a caption in our registry. oEmbed proxy iframes are
   * replaced with a direct YouTube embed so the IFrame API can sync captions.
   *
   * @param {HTMLElement} modal
   *   The modal element.
   */
  function handleModalOpen(modal) {
    var modalIframes = modal.querySelectorAll(
      'iframe.media-oembed-content,' +
      'iframe[src*="youtube"],' +
      'iframe[src*="youtu.be"]'
    );

    for (var i = 0; i < modalIframes.length; i++) {
      var modalIframe = modalIframes[i];
      var videoId = extractVideoId(modalIframe.src);

      if (!videoId || !captionRegistry[videoId]) {
        continue;
      }

      // Skip if already processed.
      if (modalIframe.closest('.yco-container')) {
        continue;
      }

      var config = captionRegistry[videoId];
      var directIframe = modalIframe;
      var isOembedProxy = modalIframe.classList.contains('media-oembed-content') &&
        modalIframe.src.indexOf('youtube.com/embed/') === -1 &&
        modalIframe.src.indexOf('youtube-nocookie.com/embed/') === -1;

      if (isOembedProxy) {
        // Get the ratio wrapper (parent of the oEmbed iframe).
        var ratioWrapper = modalIframe.parentElement;
        if (!ratioWrapper) {
          continue;
        }

        // Skip if this ratio wrapper already has a caption container.
        if (ratioWrapper.querySelector('.yco-caption-display')) {
          continue;
        }

        // Create a direct YouTube embed iframe to replace the oEmbed proxy.
        directIframe = document.createElement('iframe');
        directIframe.id = 'yco-iframe-' + (++iframeIdCounter);
        directIframe.src = 'https://www.youtube.com/embed/' + videoId +
          '?enablejsapi=1&fs=0&origin=' + encodeURIComponent(window.location.origin);
        directIframe.setAttribute('frameborder', '0');
        directIframe.setAttribute('allowfullscreen', '');
        directIframe.setAttribute('allow',
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        directIframe.className = 'yco-direct-embed';
        directIframe.title = modalIframe.title || 'YouTube video player';

        // Replace the oEmbed iframe with the direct embed.
        ratioWrapper.replaceChild(directIframe, modalIframe);
      }

      ensureApiParams(directIframe);

      if (!directIframe.id) {
        directIframe.id = 'yco-iframe-' + (++iframeIdCounter);
      }

      // Wrap the direct iframe with caption overlay.
      var dom = wrapIframe(directIframe, config, { inModal: true });

      // Fetch captions and start sync once the YT API is ready.
      (function (iframe, cfg, domRefs) {
        if (ytApiReady) {
          fetchAndSync(iframe, cfg, domRefs);
        }
        else {
          ytApiQueue.push(function () {
            fetchAndSync(iframe, cfg, domRefs);
          });
        }
      })(directIframe, config, dom);
    }
  }

  /**
   * Handles a Bootstrap modal that has just been shown, looking for
   * oEmbed iframes via play button data attributes as a fallback.
   *
   * Some themes inject the iframe HTML from the button's data-src
   * attribute when the modal opens. This function also handles the
   * case where the oEmbed iframe hasn't loaded yet by waiting for it.
   *
   * @param {HTMLElement} modal
   *   The modal element.
   */
  function handleModalOpenWithRetry(modal) {
    // First try immediately.
    var modalIframes = modal.querySelectorAll(
      'iframe.media-oembed-content,' +
      'iframe[src*="youtube"],' +
      'iframe[src*="youtu.be"]'
    );
    if (modalIframes.length > 0) {
      handleModalOpen(modal);
      return;
    }

    // The iframe may not be injected yet. Watch for it with a short poll.
    var attempts = 0;
    var maxAttempts = 20; // 2 seconds max
    var pollInterval = setInterval(function () {
      attempts++;
      var iframes = modal.querySelectorAll(
        'iframe.media-oembed-content,' +
        'iframe[src*="youtube"],' +
        'iframe[src*="youtu.be"]'
      );
      if (iframes.length > 0 || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (iframes.length > 0) {
          handleModalOpen(modal);
        }
      }
    }, 100);
  }

  /**
   * Initializes the observer for Bootstrap modal events.
   *
   * Listens for Bootstrap's shown.bs.modal event and checks
   * opened modals for oEmbed YouTube iframes to caption.
   */
  function initModalObserver() {
    if (modalObserverInitialized) {
      return;
    }
    modalObserverInitialized = true;

    // Listen for Bootstrap modal shown events (Bootstrap 4 & 5).
    document.addEventListener('shown.bs.modal', function (event) {
      var modal = event.target;
      if (modal && (modal.classList.contains('lightbox') || modal.querySelector('iframe'))) {
        handleModalOpenWithRetry(modal);
      }
    });

    // Clean up when modal closes — stop sync intervals to prevent leaks.
    document.addEventListener('hide.bs.modal', function (event) {
      var modal = event.target;
      if (!modal) {
        return;
      }
      var players = modal.querySelectorAll('.yco-player--modal, .yco-container--modal');
      for (var i = 0; i < players.length; i++) {
        var syncId = players[i].getAttribute('data-yco-sync-id');
        if (syncId) {
          clearInterval(parseInt(syncId, 10));
          players[i].removeAttribute('data-yco-sync-id');
        }
      }
    });

    // Fallback: Use MutationObserver for non-Bootstrap modals or
    // cases where the event doesn't bubble properly.
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var addedNodes = mutations[i].addedNodes;
        for (var j = 0; j < addedNodes.length; j++) {
          var node = addedNodes[j];
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          // Check if the added node is a modal/dialog that may contain video.
          var modal = null;
          if (node.classList && node.classList.contains('modal') &&
              (node.classList.contains('lightbox') || node.querySelector('iframe'))) {
            modal = node;
          }
          else if (node.querySelector) {
            modal = node.querySelector('.modal.lightbox');
            if (!modal) {
              var candidateModal = node.querySelector('.modal');
              if (candidateModal && candidateModal.querySelector('iframe')) {
                modal = candidateModal;
              }
            }
          }

          if (modal) {
            // Wait a tick for the iframe to be injected.
            (function (m) {
              setTimeout(function () {
                handleModalOpenWithRetry(m);
              }, 200);
            })(modal);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also handle modals that are already in the DOM but become visible.
    // This handles the case where Bootstrap reuses existing modal elements.
    document.addEventListener('click', function (event) {
      var playButton = event.target.closest(
        'button.play-button[data-url*="youtu"],' +
        'button.lightbox-video[data-url*="youtu"],' +
        '[data-video-url*="youtu"],' +
        '.video-thumbnail[data-url*="youtu"],' +
        'a[href*="youtu"][data-toggle="modal"],' +
        'a[href*="youtu"][data-bs-toggle="modal"]'
      );
      if (!playButton) {
        return;
      }

      var videoUrl = playButton.getAttribute('data-url') ||
                     playButton.getAttribute('data-video-url') ||
                     playButton.getAttribute('href') || '';
      var videoId = extractVideoId(videoUrl);
      if (!videoId || !captionRegistry[videoId]) {
        return;
      }

      // The modal will be shown after this click. Wait for it.
      setTimeout(function () {
        var visibleModals = document.querySelectorAll('.modal.show, .modal[style*="display: block"]');
        for (var i = 0; i < visibleModals.length; i++) {
          handleModalOpenWithRetry(visibleModals[i]);
        }
      }, 300);
    });
  }

  // ---------------------------------------------------------------
  // Drupal behavior
  // ---------------------------------------------------------------

  /**
   * Drupal behavior for Remedy YouTube Caption Overlay.
   */
  Drupal.behaviors.youtubeCaptionOverlay = {
    attach: function (context) {
      // Find all unprocessed caption data elements (field wrapper or legacy data carrier).
      var dataElements = once('yco-processed', '.yco-field-wrapper, .yco-data', context);

      if (dataElements.length === 0) {
        return;
      }

      // Ensure the YouTube API is loaded.
      loadYouTubeApi();

      for (var i = 0; i < dataElements.length; i++) {
        var el = dataElements[i];
        var config = {
          videoId: el.getAttribute('data-video-id'),
          captionUrl: el.getAttribute('data-caption-url'),
          captionFormat: el.getAttribute('data-caption-format'),
          fontSize: el.getAttribute('data-caption-font-size') || '0.85em',
          background: el.getAttribute('data-caption-background') || 'rgba(0, 0, 0, 0.75)',
          color: el.getAttribute('data-caption-color') || '#FFFFFF',
          showTranscript: el.getAttribute('data-show-transcript') === 'true'
        };

        if (!config.videoId || !config.captionUrl ||
            ['srt', 'vtt'].indexOf(config.captionFormat) === -1) {
          continue;
        }

        // Register this config for modal/lightbox lookups.
        captionRegistry[config.videoId] = config;

        // --- Strategy 1: Direct YouTube iframes in the page DOM ---
        var iframes = findIframes(config.videoId);

        for (var j = 0; j < iframes.length; j++) {
          (function (iframe, cfg) {
            if (ytApiReady) {
              initOverlay(iframe, cfg);
            }
            else {
              ytApiQueue.push(function () {
                initOverlay(iframe, cfg);
              });
            }
          })(iframes[j], config);
        }

        // --- Strategy 2: oEmbed proxy iframes behind lightbox modals ---
        // Initialize the modal observer once to handle lightbox opens.
        initModalObserver();
      }
    }
  };

})(Drupal, once);
