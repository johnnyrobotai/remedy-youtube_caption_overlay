<?php

declare(strict_types=1);

use Symfony\Component\Yaml\Yaml;

$root = dirname(__DIR__);
$autoload = $root . '/vendor/autoload.php';

if (!file_exists($autoload)) {
  fwrite(STDERR, "Missing vendor/autoload.php. Run `composer install` before module checks.\n");
  exit(1);
}

require $autoload;

$moduleName = 'youtube_caption_overlay';
$requiredFiles = [
  "{$moduleName}.info.yml",
  "{$moduleName}.libraries.yml",
  "{$moduleName}.module",
  'config/schema/youtube_caption_overlay.schema.yml',
  'css/youtube-caption-overlay.css',
  'js/srt-parser.js',
  'js/vtt-parser.js',
  'js/youtube-caption-overlay.js',
  'src/Plugin/Field/FieldType/YoutubeCaptionOverlayItem.php',
  'src/Plugin/Field/FieldWidget/YoutubeCaptionOverlayWidget.php',
  'src/Plugin/Field/FieldFormatter/YoutubeCaptionOverlayFormatter.php',
  'templates/youtube-caption-overlay.html.twig',
  'README.md',
];

$errors = [];

foreach ($requiredFiles as $relativePath) {
  if (!is_file($root . '/' . $relativePath)) {
    $errors[] = "Missing required file: {$relativePath}";
  }
}

if ($errors === []) {
  $info = Yaml::parseFile($root . "/{$moduleName}.info.yml");
  if (($info['type'] ?? NULL) !== 'module') {
    $errors[] = "{$moduleName}.info.yml must declare type: module.";
  }
  if (($info['core_version_requirement'] ?? NULL) !== '^10 || ^11') {
    $errors[] = "{$moduleName}.info.yml must support Drupal ^10 || ^11.";
  }
  if (!in_array('drupal:file', $info['dependencies'] ?? [], TRUE)) {
    $errors[] = "{$moduleName}.info.yml must depend on drupal:file.";
  }

  $libraries = Yaml::parseFile($root . "/{$moduleName}.libraries.yml");
  $library = $libraries[$moduleName] ?? NULL;
  if (!is_array($library)) {
    $errors[] = "{$moduleName}.libraries.yml must define the {$moduleName} library.";
  }
  else {
    assertAssetExists($root, 'css/youtube-caption-overlay.css', $library['css']['component'] ?? [], $errors);
    assertAssetExists($root, 'js/srt-parser.js', $library['js'] ?? [], $errors);
    assertAssetExists($root, 'js/vtt-parser.js', $library['js'] ?? [], $errors);
    assertAssetExists($root, 'js/youtube-caption-overlay.js', $library['js'] ?? [], $errors);

    foreach (['core/drupal', 'core/drupalSettings', 'core/once'] as $dependency) {
      if (!in_array($dependency, $library['dependencies'] ?? [], TRUE)) {
        $errors[] = "{$moduleName}.libraries.yml must declare dependency {$dependency}.";
      }
    }
  }

  $moduleFile = file_get_contents($root . "/{$moduleName}.module");
  if ($moduleFile === FALSE || strpos($moduleFile, 'function youtube_caption_overlay_theme()') === FALSE) {
    $errors[] = "{$moduleName}.module must implement youtube_caption_overlay_theme().";
  }

  assertFileContains($root, 'src/Plugin/Field/FieldType/YoutubeCaptionOverlayItem.php', 'id = "youtube_caption_overlay"', $errors);
  assertFileContains($root, 'src/Plugin/Field/FieldWidget/YoutubeCaptionOverlayWidget.php', 'id = "youtube_caption_overlay_widget"', $errors);
  assertFileContains($root, 'src/Plugin/Field/FieldFormatter/YoutubeCaptionOverlayFormatter.php', 'id = "youtube_caption_overlay_formatter"', $errors);

  $readme = file_get_contents($root . '/README.md') ?: '';
  foreach ([
    'modules/custom/youtube_caption_overlay/',
    'drush en youtube_caption_overlay',
    'drush cr',
    'youtube_caption_overlay.info.yml',
    'Production Deployment Checklist',
  ] as $needle) {
    if (strpos($readme, $needle) === FALSE) {
      $errors[] = "README.md must document {$needle}.";
    }
  }
}

if ($errors !== []) {
  fwrite(STDERR, "Module validation failed:\n");
  foreach ($errors as $error) {
    fwrite(STDERR, " - {$error}\n");
  }
  exit(1);
}

echo "Module file, library, plugin, and install documentation checks passed.\n";

/**
 * Checks that a library asset exists on disk and is declared in libraries.yml.
 */
function assertAssetExists(string $root, string $asset, array $declarations, array &$errors): void {
  if (!array_key_exists($asset, $declarations)) {
    $errors[] = "Library asset is not declared: {$asset}";
    return;
  }

  if (!is_file($root . '/' . $asset)) {
    $errors[] = "Library asset does not exist: {$asset}";
  }
}

/**
 * Checks that a file contains an expected marker.
 */
function assertFileContains(string $root, string $relativePath, string $needle, array &$errors): void {
  $contents = file_get_contents($root . '/' . $relativePath);
  if ($contents === FALSE || strpos($contents, $needle) === FALSE) {
    $errors[] = "{$relativePath} must contain {$needle}.";
  }
}
