<?php

require_once __DIR__ . '/helpers.php';

$token = trim($_GET['token'] ?? '');

if (!$token) {
    header('Location: index.html');
    exit;
}

$db = getDB();

$stmt = $db->prepare("
    SELECT id, name
    FROM groups
    WHERE invite_token = ?
");

$stmt->execute([$token]);

$foundGroup = $stmt->fetch();

if (!$foundGroup) {
    header('Location: auth.html?error=invalid_invite');
    exit;
}

// Store group_id in session
session_start();

$_SESSION['pending_invite_group_id'] = $foundGroup['id'];
$_SESSION['pending_invite_group_name'] = $foundGroup['name'];

// Redirect to auth page
header(
    'Location: auth.html?invite=1&group=' .
    urlencode($foundGroup['name'])
);

exit;