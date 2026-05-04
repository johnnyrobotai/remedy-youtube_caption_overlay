<?php

declare(strict_types=1);

$root = dirname(__DIR__);

$runtimePatterns = [
  '/^youtube_caption_overlay\.(info\.yml|libraries\.yml|module)$/',
  '/^config\/schema\/youtube_caption_overlay\.schema\.yml$/',
  '/^css\/[^\/]+\.css$/',
  '/^js\/[^\/]+\.js$/',
  '/^src\/.+\.php$/',
  '/^templates\/[^\/]+\.html\.twig$/',
];

$trackedFilesOutput = runCommand('git ls-files -z', $root);
$trackedFiles = array_values(array_filter(explode("\0", $trackedFilesOutput), static fn(string $path): bool => $path !== ''));

$errors = [];
foreach ($trackedFiles as $file) {
  $isRuntime = matchesAnyPattern($file, $runtimePatterns);
  $isExportIgnored = isExportIgnored($file, $root);

  if ($isRuntime && $isExportIgnored) {
    $errors[] = "Runtime file must not be export-ignored: {$file}";
  }
  elseif (!$isRuntime && !$isExportIgnored) {
    $errors[] = "Non-runtime file must be export-ignored: {$file}";
  }
}

if ($errors !== []) {
  fwrite(STDERR, "Deployment export validation failed:\n");
  foreach ($errors as $error) {
    fwrite(STDERR, " - {$error}\n");
  }
  exit(1);
}

printf("Deployment export surface validated across %d tracked file(s).\n", count($trackedFiles));

/**
 * Runs a shell command from the repository root and returns stdout.
 */
function runCommand(string $command, string $cwd): string {
  $descriptorSpec = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
  ];

  $process = proc_open($command, $descriptorSpec, $pipes, $cwd);
  if (!is_resource($process)) {
    fwrite(STDERR, "Unable to start command: {$command}\n");
    exit(1);
  }

  fclose($pipes[0]);
  $stdout = stream_get_contents($pipes[1]);
  $stderr = stream_get_contents($pipes[2]);
  fclose($pipes[1]);
  fclose($pipes[2]);

  $exitCode = proc_close($process);
  if ($exitCode !== 0) {
    fwrite(STDERR, trim($stderr) . "\n");
    exit($exitCode);
  }

  return $stdout === FALSE ? '' : $stdout;
}

/**
 * Determines whether a path matches any allowed runtime pattern.
 */
function matchesAnyPattern(string $path, array $patterns): bool {
  foreach ($patterns as $pattern) {
    if (preg_match($pattern, $path) === 1) {
      return TRUE;
    }
  }

  return FALSE;
}

/**
 * Determines whether Git marks a path with export-ignore.
 */
function isExportIgnored(string $path, string $root): bool {
  $output = runCommand('git check-attr export-ignore -- ' . escapeshellarg($path), $root);

  return str_ends_with(trim($output), ': export-ignore: set');
}
