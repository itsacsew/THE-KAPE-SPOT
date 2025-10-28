<?php
require_once 'config.php';

setCORSHeaders();
$conn = getDBConnection();

$result = $conn->query("SELECT id, name FROM categories ORDER BY name");

$categories = [];
while ($row = $result->fetch_assoc()) {
    $row['id'] = (string)$row['id'];
    $categories[] = $row;
}

echo json_encode($categories);

$conn->close();
