<?php
// auth.php  →  http://localhost/article-dashboard/auth.php?action=login
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'login'    => handleLogin(),
    'register' => handleRegister(),
    'logout'   => handleLogout(),
    'me'       => handleMe(),
    default    => jsonError('Unknown action', 404),
};

function handleLogin(): void {
    $body     = getBody();
    $email    = trim($body['email']    ?? '');
    $password = trim($body['password'] ?? '');
    if (!$email || !$password) jsonError('Email and password are required');

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM users WHERE email=? AND is_active=1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // if (!$user || !password_verify($password, $user['password']))
   if (!$user || $password !== $user['password']) 
        jsonError('Invalid email or password', 401);

    $db->prepare("DELETE FROM sessions WHERE user_id=?")->execute([$user['id']]);

    $token     = generateToken();
    $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));
    $db->prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)")
       ->execute([$user['id'], $token, $expiresAt]);
    $db->prepare("UPDATE users SET last_seen=NOW() WHERE id=?")->execute([$user['id']]);

    unset($user['password']);
    jsonSuccess(['token'=>$token, 'user'=>$user], 'Login successful');
}

function handleRegister(): void {
    $body     = getBody();
    $name     = trim($body['name']      ?? '');
    $email    = trim($body['email']     ?? '');
    $password = trim($body['password']  ?? '');
    $role     = trim($body['role']      ?? 'author');
    $jobTitle = trim($body['job_title'] ?? '');
    $org      = trim($body['org']       ?? '');

    if (!$name)                                        jsonError('Name is required');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))    jsonError('Valid email is required');
    if (strlen($password) < 8)                         jsonError('Password must be at least 8 characters');
    if (!in_array($role, ['admin','author']))           $role = 'author';

    $db   = getDB();
    $stmt = $db->prepare("SELECT id FROM users WHERE email=?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) jsonError('An account with this email already exists');

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $db->prepare("INSERT INTO users (name,email,password,role,job_title,org) VALUES (?,?,?,?,?,?)")
       ->execute([$name, $email, $hash, $role, $jobTitle, $org]);

    $userId    = (int)$db->lastInsertId();
    $token     = generateToken();
    $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));
    $db->prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)")
       ->execute([$userId, $token, $expiresAt]);

    $stmt = $db->prepare("SELECT id,name,email,role,job_title,org,avatar,created_at FROM users WHERE id=?");
    $stmt->execute([$userId]);
    jsonSuccess(['token'=>$token, 'user'=>$stmt->fetch()], 'Account created', 201);
}

function handleLogout(): void {
    $headers    = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (str_starts_with($authHeader, 'Bearer ')) {
        $token = substr($authHeader, 7);
        getDB()->prepare("DELETE FROM sessions WHERE token=?")->execute([$token]);
    }
    jsonSuccess([], 'Logged out');
}

function handleMe(): void {
    jsonSuccess(requireAuth());
}
