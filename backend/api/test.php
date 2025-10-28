<?php
require_once 'config.php';

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

// Simple response to confirm server is working
echo json_encode([
    'status' => 'success',
    'message' => 'KapeSpot Server is running',
    'timestamp' => date('Y-m-d H:i:s')
]);
