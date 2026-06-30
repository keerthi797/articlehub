<?php
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'list'     => listArticles(),
    'share'    => shareArticle(),
    'pin'      => pinArticle(),
    'unpin'    => unpinArticle(),
    'delete'   => deleteArticle(),
    'forward'  => forwardArticle(),
    'view'     => recordView(),
    'views'    => getViews(),
    'fetch_og' => fetchOg(),
    'facebook_share'=> shareOnFacebook(), // new code for sharing articles on facebook
    // share article
    default    => jsonError('Unknown action', 404),
};

function listArticles(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');
    if (!isMember($groupId, $user['id'])) jsonError('Access denied', 403);

    $db   = getDB();
    $stmt = $db->prepare("SELECT a.*, u.name AS shared_by_name, u.role AS shared_by_role,
               (SELECT COUNT(*) FROM article_views av WHERE av.article_id=a.id) AS view_count,
               (SELECT reaction_type FROM reactions r WHERE r.target_type='article' AND r.target_id=a.id AND r.user_id=?) AS my_reaction
        FROM articles a JOIN users u ON u.id=a.shared_by
        WHERE a.group_id=? ORDER BY a.is_pinned DESC, a.created_at DESC");
    $stmt->execute([$user['id'], $groupId]);
    $articles = $stmt->fetchAll();
    $reactStmt = $db->prepare("SELECT reaction_type, COUNT(*) AS cnt FROM reactions WHERE target_type='article' AND target_id=? GROUP BY reaction_type");
    foreach ($articles as &$article) {
        $reactStmt->execute([$article['id']]);
        $article['reactions'] = $reactStmt->fetchAll();
    }
    jsonSuccess($articles);
}

function shareArticle(): void {
    $user    = requireAuth();
    $body    = getBody();
    $groupId = (int)($body['group_id'] ?? 0);
    $url     = trim($body['url'] ?? '');
    if (!$groupId) jsonError('group_id required');
    if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) jsonError('Valid URL required');
    if (!isMember($groupId, $user['id'])) jsonError('Access denied', 403);

    $meta = fetchOgMeta($url);
    $db   = getDB();
    $db->prepare("INSERT INTO articles (group_id,shared_by,article_url,article_title,thumbnail,description,source_name) VALUES (?,?,?,?,?,?,?)")
       ->execute([$groupId, $user['id'], $url, $meta['title'], $meta['image'], $meta['description'], $meta['source']]);
    $articleId = (int)$db->lastInsertId();

    $members = $db->prepare("SELECT user_id FROM group_members WHERE group_id=?");
    $members->execute([$groupId]);
    foreach ($members->fetchAll() as $m)
        createNotification($m['user_id'], $user['id'], 'article_shared', 'article', $articleId, $user['name'].' shared an article');

    $stmt = $db->prepare("SELECT a.*, u.name AS shared_by_name FROM articles a JOIN users u ON u.id=a.shared_by WHERE a.id=?");
    $stmt->execute([$articleId]);
    jsonSuccess($stmt->fetch(), 'Article shared', 201);
}

function pinArticle(): void {
    $user      = requireAdmin();
    $articleId = (int)($_GET['id'] ?? 0);
    if (!$articleId) jsonError('Article ID required');
    $db = getDB();
    $db->prepare("UPDATE articles SET is_pinned=1 WHERE id=?")->execute([$articleId]);
    $s = $db->prepare("SELECT group_id FROM articles WHERE id=?"); $s->execute([$articleId]); $a = $s->fetch();
    if ($a) {
        $members = $db->prepare("SELECT user_id FROM group_members WHERE group_id=?");
        $members->execute([$a['group_id']]);
        foreach ($members->fetchAll() as $m)
            createNotification($m['user_id'], $user['id'], 'pin', 'article', $articleId, $user['name'].' pinned an article');
    }
    jsonSuccess([], 'Article pinned');
}

function unpinArticle(): void {   
    $user      = requireAuth();
    $articleId = (int)($_GET['id'] ?? 0);
    if (!$articleId) jsonError('Article ID required');
    $db = getDB();
    $stmt = $db->prepare("SELECT shared_by FROM articles WHERE id=?");
    $stmt->execute([$articleId]);
    $article = $stmt->fetch();
    if (!$article) jsonError('Article not found', 404);
    if ((int)$article['shared_by'] !== (int)$user['id'] && $user['role'] !== 'admin') jsonError('Access denied', 403);
    $db->prepare("UPDATE articles SET is_pinned=0 WHERE id=?")->execute([$articleId]);
    jsonSuccess([], 'Article unpinned');
}

function deleteArticle(): void {
    $user      = requireAuth();
    $articleId = (int)($_GET['id'] ?? 0);
    if (!$articleId) jsonError('Article ID required');
    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM articles WHERE id=?"); $stmt->execute([$articleId]);
    $article = $stmt->fetch();
    if (!$article) jsonError('Article not found', 404);
    if ($article['shared_by'] !== $user['id'] && $user['role'] !== 'admin') jsonError('Access denied', 403);
    $db->prepare("DELETE FROM articles WHERE id=?")->execute([$articleId]);
    jsonSuccess([], 'Article deleted');
}

function forwardArticle(): void { 
    
    $user      = requireAuth();
    $body      = getBody();    
    $articleId = (int)($body['article_id'] ?? 0);
    $targetIds = $body['group_ids'] ?? [];
    if (!$articleId || empty($targetIds)) jsonError('article_id and group_ids required');
    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM articles WHERE id=?"); $stmt->execute([$articleId]);
    $article = $stmt->fetch();
    if (!$article) jsonError('Article not found', 404);
    $ins = $db->prepare("INSERT INTO articles (group_id,shared_by,article_url,article_title,thumbnail,description,source_name,is_forwarded,forwarded_from) VALUES (?,?,?,?,?,?,?,1,?)");
    $forwarded = [];
    foreach ($targetIds as $gid) {
        $gid = (int)$gid;
        if ($gid && isMember($gid, $user['id'])) {
            $ins->execute([$gid,$user['id'],$article['article_url'],$article['article_title'],$article['thumbnail'],$article['description'],$article['source_name'],$articleId]);
            $forwarded[] = $gid;
        }
    }
    jsonSuccess(['forwarded_to'=>$forwarded], 'Article forwarded');
}

function recordView(): void {
    $user      = requireAuth();
    $articleId = (int)($_GET['id'] ?? 0);
    if (!$articleId) jsonError('Article ID required');
    getDB()->prepare("INSERT IGNORE INTO article_views (article_id,user_id) VALUES (?,?)")->execute([$articleId,$user['id']]);
    jsonSuccess([], 'View recorded');
}

function getViews(): void {
    requireAdmin();
    $articleId = (int)($_GET['id'] ?? 0);
    if (!$articleId) jsonError('Article ID required');
    $stmt = getDB()->prepare("SELECT u.id,u.name,u.email,av.viewed_at FROM article_views av JOIN users u ON u.id=av.user_id WHERE av.article_id=? ORDER BY av.viewed_at DESC");
    $stmt->execute([$articleId]);
    jsonSuccess($stmt->fetchAll());
}

function fetchOg(): void {
    requireAuth();
    $url = trim($_GET['url'] ?? '');
    if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) jsonError('Valid URL required');
    jsonSuccess(fetchOgMeta($url));
}
