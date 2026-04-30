<?php

namespace Drupal\youtube_caption_overlay\Plugin\Field\FieldFormatter;

use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Field\FormatterBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Plugin implementation of the Remedy YouTube Caption Overlay formatter.
 *
 * Renders caption data and a responsive YouTube iframe for overlay sync.
 *
 * @FieldFormatter(
 *   id = "youtube_caption_overlay_formatter",
 *   label = @Translation("Remedy YouTube Caption Overlay"),
 *   field_types = {
 *     "youtube_caption_overlay"
 *   }
 * )
 */
class YoutubeCaptionOverlayFormatter extends FormatterBase {

  /**
   * {@inheritdoc}
   */
  public static function defaultSettings() {
    return [
      'caption_font_size' => '0.85em',
      'caption_background' => 'rgba(0, 0, 0, 0.75)',
      'caption_color' => '#FFFFFF',
      'show_transcript' => FALSE,
    ] + parent::defaultSettings();
  }

  /**
   * {@inheritdoc}
   */
  public function settingsForm(array $form, FormStateInterface $form_state) {
    $elements = parent::settingsForm($form, $form_state);

    $elements['caption_font_size'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Caption font size'),
      '#default_value' => $this->getSetting('caption_font_size'),
      '#description' => $this->t('CSS font-size value (e.g. 1.2em, 16px).'),
      '#size' => 10,
    ];

    $elements['caption_background'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Caption background'),
      '#default_value' => $this->getSetting('caption_background'),
      '#description' => $this->t('CSS background value for the caption box.'),
      '#size' => 30,
    ];

    $elements['caption_color'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Caption text color'),
      '#default_value' => $this->getSetting('caption_color'),
      '#description' => $this->t('CSS color value for the caption text.'),
      '#size' => 10,
    ];

    $elements['show_transcript'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Show transcript panel'),
      '#default_value' => $this->getSetting('show_transcript'),
      '#description' => $this->t('Display a scrolling transcript panel below the video.'),
    ];

    return $elements;
  }

  /**
   * {@inheritdoc}
   */
  public function settingsSummary() {
    $summary = [];
    $summary[] = $this->t('Font size: @size', ['@size' => $this->getSetting('caption_font_size')]);
    $summary[] = $this->t('Background: @bg', ['@bg' => $this->getSetting('caption_background')]);
    $summary[] = $this->t('Color: @color', ['@color' => $this->getSetting('caption_color')]);
    $summary[] = $this->getSetting('show_transcript')
      ? $this->t('Transcript: shown')
      : $this->t('Transcript: hidden');
    return $summary;
  }

  /**
   * {@inheritdoc}
   */
  public function viewElements(FieldItemListInterface $items, $langcode) {
    $elements = [];

    foreach ($items as $delta => $item) {
      if ($item->isEmpty()) {
        continue;
      }

      $caption_format = $item->getCaptionFormat();
      if (!$caption_format) {
        continue;
      }

      // Build the caption file URL.
      $caption_url = NULL;
      $fid = $item->caption_fid;
      if ($fid) {
        /** @var \Drupal\file\FileInterface|null $file */
        $file = \Drupal::entityTypeManager()->getStorage('file')->load($fid);
        if ($file) {
          $caption_url = \Drupal::service('file_url_generator')->generateString($file->getFileUri());
        }
      }

      if (!$caption_url) {
        continue;
      }

      $elements[$delta] = [
        '#theme' => 'youtube_caption_overlay',
        '#youtube_video_id' => $item->youtube_video_id,
        '#caption_file_url' => $caption_url,
        '#caption_format' => $caption_format,
        '#caption_font_size' => $this->getSetting('caption_font_size'),
        '#caption_background' => $this->getSetting('caption_background'),
        '#caption_color' => $this->getSetting('caption_color'),
        '#show_transcript' => $this->getSetting('show_transcript'),
        '#base_url' => \Drupal::request()->getSchemeAndHttpHost(),
        '#attached' => [
          'library' => [
            'youtube_caption_overlay/youtube_caption_overlay',
          ],
        ],
      ];
    }

    return $elements;
  }

}
