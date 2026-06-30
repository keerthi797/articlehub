<?php
// settings.php – Settings management API

require_once __DIR__ . '/helpers.php';

setCORSHeaders();

$action = $_GET['action'] ?? '';

match($action) {
    'get'  => actionGet(),
    'set'  => actionSet(),
    default => jsonError('Unknown action')
};

// ── GET a setting ─────────────────────────────────────────
function actionGet(): never {
    requireAuth(); // Any authenticated user can view settings
    
    $key = $_GET['key'] ?? '';
    if (!$key) jsonError('Missing setting key');
    
    $value = getSetting($key);
    if ($value === null) jsonError('Setting not found', 404);
    
    jsonSuccess(['key' => $key, 'value' => $value]);
}

// ── SET a setting ─────────────────────────────────────────
function actionSet(): never {
    requireAdmin(); // Only admins can change settings
    
    $body = getBody();
    $key = $body['key'] ?? '';
    $value = $body['value'] ?? null;
    
    if (!$key) jsonError('Missing setting key');
    if ($value === null) jsonError('Missing setting value');
    
    setSetting($key, $value);
    jsonSuccess(['key' => $key, 'value' => $value], 'Setting updated');
}
