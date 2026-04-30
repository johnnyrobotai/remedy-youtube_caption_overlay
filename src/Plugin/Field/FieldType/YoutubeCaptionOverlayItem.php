<?php

namespace Drupal\youtube_caption_overlay\Plugin\Field\FieldType;

use Drupal\Core\Field\FieldItemBase;
use Drupal\Core\Field\FieldStorageDefinitionInterface;
use Drupal\Core\TypedData\DataDefinition;

/**
 * Plugin implementation of the Remedy YouTube Caption Overlay field type.
 *
 * @FieldType(
 *   id = "youtube_caption_overlay",
 *   label = @Translation("Remedy YouTube Caption Overlay"),
 *   description = @Translation("Stores a YouTube video ID paired with an SRT/VTT caption file for overlay display."),
 *   default_widget = "youtube_caption_overlay_widget",
 *   default_formatter = "youtube_caption_overlay_formatter",
 *   category = @Translation("Media"),
 * )
 */
class YoutubeCaptionOverlayItem extends FieldItemBase {

  /**
   * {@inheritdoc}
   */
  public static function schema(FieldStorageDefinitionInterface $field_definition) {
    return [
      'columns' => [
        'youtube_video_id' => [
          'type' => 'varchar',
          'length' => 20,
          'not null' => FALSE,
        ],
        'caption_fid' => [
          'type' => 'int',
          'unsigned' => TRUE,
          'not null' => FALSE,
        ],
        'caption_lang' => [
          'type' => 'varchar',
          'length' => 10,
          'not null' => FALSE,
        ],
        'caption_label' => [
          'type' => 'varchar',
          'length' => 255,
          'not null' => FALSE,
        ],
      ],
      'indexes' => [
        'caption_fid' => ['caption_fid'],
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public static function propertyDefinitions(FieldStorageDefinitionInterface $field_definition) {
    $properties = [];

    $properties['youtube_video_id'] = DataDefinition::create('string')
      ->setLabel(t('YouTube Video ID'))
      ->setRequired(TRUE);

    $properties['caption_fid'] = DataDefinition::create('integer')
      ->setLabel(t('Caption file ID'))
      ->setRequired(TRUE);

    $properties['caption_lang'] = DataDefinition::create('string')
      ->setLabel(t('Caption language code'));

    $properties['caption_label'] = DataDefinition::create('string')
      ->setLabel(t('Caption label'));

    return $properties;
  }

  /**
   * {@inheritdoc}
   */
  public function isEmpty() {
    $video_id = $this->get('youtube_video_id')->getValue();
    return empty($video_id);
  }

  /**
   * {@inheritdoc}
   */
  public function getConstraints() {
    $constraints = parent::getConstraints();
    $constraint_manager = \Drupal::typedDataManager()->getValidationConstraintManager();

    $constraints[] = $constraint_manager->create('ComplexData', [
      'youtube_video_id' => [
        'Regex' => [
          'pattern' => '/^[a-zA-Z0-9_-]{11}$/',
          'message' => t('The YouTube video ID must be exactly 11 characters (letters, numbers, hyphens, and underscores).'),
        ],
      ],
    ]);

    return $constraints;
  }

  /**
   * Returns the caption format based on the referenced file's extension.
   *
   * @return string|null
   *   'srt' or 'vtt', or NULL if no file is referenced.
   */
  public function getCaptionFormat() {
    $fid = $this->get('caption_fid')->getValue();
    if (empty($fid)) {
      return NULL;
    }

    /** @var \Drupal\file\FileInterface|null $file */
    $file = \Drupal::entityTypeManager()->getStorage('file')->load($fid);
    if (!$file) {
      return NULL;
    }

    $filename = $file->getFilename();
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

    return in_array($extension, ['srt', 'vtt']) ? $extension : NULL;
  }

  /**
   * {@inheritdoc}
   */
  public static function defaultFieldSettings() {
    return [] + parent::defaultFieldSettings();
  }

  /**
   * {@inheritdoc}
   */
  public static function defaultStorageSettings() {
    return [] + parent::defaultStorageSettings();
  }

}
