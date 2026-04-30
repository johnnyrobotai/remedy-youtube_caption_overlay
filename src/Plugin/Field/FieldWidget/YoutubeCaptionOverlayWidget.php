<?php

namespace Drupal\youtube_caption_overlay\Plugin\Field\FieldWidget;

use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Field\WidgetBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Plugin implementation of the Remedy YouTube Caption Overlay widget.
 *
 * @FieldWidget(
 *   id = "youtube_caption_overlay_widget",
 *   label = @Translation("Remedy YouTube Caption Overlay"),
 *   field_types = {
 *     "youtube_caption_overlay"
 *   }
 * )
 */
class YoutubeCaptionOverlayWidget extends WidgetBase {

  /**
   * {@inheritdoc}
   */
  public function formElement(FieldItemListInterface $items, $delta, array $element, array &$form, FormStateInterface $form_state) {

    $element['youtube_video_id'] = [
      '#type' => 'textfield',
      '#title' => $this->t('YouTube Video ID'),
      '#description' => $this->t('Enter the 11-character YouTube video ID (the part after <code>v=</code> in the URL). For example, if the URL is <code>https://www.youtube.com/watch?v=dQw4w9WgXcQ</code>, enter <code>dQw4w9WgXcQ</code>.'),
      '#default_value' => $items[$delta]->youtube_video_id ?? '',
      '#maxlength' => 11,
      '#size' => 11,
      '#pattern' => '[a-zA-Z0-9_-]{11}',
    ];

    $element['caption_fid'] = [
      '#type' => 'managed_file',
      '#title' => $this->t('Caption File (SRT or VTT)'),
      '#description' => $this->t('Upload an SRT or WebVTT caption file. This will be displayed as a synchronized text overlay on top of the YouTube video.'),
      '#upload_location' => 'public://youtube_captions',
      '#upload_validators' => [
        'file_validate_extensions' => ['srt vtt'],
        'file_validate_size' => [5 * 1024 * 1024],
      ],
      '#default_value' => !empty($items[$delta]->caption_fid) ? [$items[$delta]->caption_fid] : [],
    ];

    $element['caption_lang'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Language Code'),
      '#description' => $this->t('ISO 639-1 code (e.g. en, es, fr)'),
      '#default_value' => $items[$delta]->caption_lang ?? 'en',
      '#size' => 5,
      '#maxlength' => 10,
    ];

    $element['caption_label'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Caption Label'),
      '#description' => $this->t('Human-readable label (e.g. English, Español)'),
      '#default_value' => $items[$delta]->caption_label ?? 'English',
      '#size' => 30,
      '#maxlength' => 255,
    ];

    return $element;
  }

  /**
   * {@inheritdoc}
   */
  public function massageFormValues(array $values, array $form, FormStateInterface $form_state) {
    foreach ($values as &$value) {
      $value['youtube_video_id'] = isset($value['youtube_video_id']) ? trim($value['youtube_video_id']) : '';
      $value['caption_lang'] = isset($value['caption_lang']) ? trim($value['caption_lang']) : '';
      $value['caption_label'] = isset($value['caption_label']) ? trim($value['caption_label']) : '';

      // The managed_file element returns an array of file IDs.
      if (isset($value['caption_fid']) && is_array($value['caption_fid'])) {
        $fids = array_filter($value['caption_fid']);
        $value['caption_fid'] = reset($fids) ?: NULL;
      }

      if ($value['youtube_video_id'] === '') {
        $value['caption_fid'] = NULL;
        continue;
      }

      // Mark file as permanent if we have one.
      if (!empty($value['caption_fid'])) {
        /** @var \Drupal\file\FileInterface|null $file */
        $file = \Drupal::entityTypeManager()->getStorage('file')->load($value['caption_fid']);
        if ($file && $file->isTemporary()) {
          $file->setPermanent();
          $file->save();
        }
      }
    }
    unset($value);

    return $values;
  }

}
