<?php
// db.php  ← sits in root of article-dashboard/
// Edit DB_USER / DB_PASS if your XAMPP MySQL has a password

define('DB_HOST', 'localhost');
define('DB_NAME', 'articlhub');
define('DB_USER', 'root');
define('DB_PASS', '');          // XAMPP default = empty
define('DB_CHARSET', 'utf8mb4');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=".DB_CHARSET;
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success'=>false,'message'=>'DB error: '.$e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}
