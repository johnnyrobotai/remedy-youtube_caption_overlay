<?php

declare(strict_types=1);

use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

$root = dirname(__DIR__);
$autoload = $root . '/vendor/autoload.php';

if (!file_exists($autoload)) {
  fwrite(STDERR, "Missing vendor/autoload.php. Run `composer install` before YAML linting.\n");
  exit(1);
}

require $autoload;

$excludedDirectories = [
  '.git',
  'node_modules',
  'vendor',
];

$files = [];
$directory = new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS);
$iterator = new RecursiveIteratorIterator(
  new RecursiveCallbackFilterIterator(
    $directory,
    static function (SplFileInfo $current) use ($excludedDirectories): bool {
      if ($current->isDir()) {
        return !in_array($current->getFilename(), $excludedDirectories, TRUE);
      }

      return TRUE;
    }
  )
);

foreach ($iterator as $file) {
  if (!$file instanceof SplFileInfo || !$file->isFile()) {
    continue;
  }

  if (preg_match('/\.ya?ml$/', $file->getFilename()) === 1) {
    $files[] = $file->getPathname();
  }
}

sort($files);

$failures = [];
foreach ($files as $file) {
  try {
    Yaml::parseFile($file);
  }
  catch (ParseException $exception) {
    $relativePath = ltrim(str_replace($root, '', $file), DIRECTORY_SEPARATOR);
    $failures[] = sprintf('%s: %s', $relativePath, $exception->getMessage());
  }
}

if ($failures !== []) {
  fwrite(STDERR, "YAML validation failed:\n");
  foreach ($failures as $failure) {
    fwrite(STDERR, " - {$failure}\n");
  }
  exit(1);
}

printf("Validated %d YAML file(s).\n", count($files));
