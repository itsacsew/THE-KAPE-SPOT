<?php
// api/index.php - Vercel PHP Router
require_once 'config.php';

setCORSHeaders();

// Get the request path
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$path = str_replace('/api/', '', $path);

// Route the requests
switch ($path) {
    case 'items':
        require 'items.php';
        break;
    case 'categories':
        require 'categories.php';
        break;
    case 'orders':
        require 'orders.php';
        break;
    case 'cups':
        require 'cups.php';
        break;
    case 'users':
        require 'users.php';
        break;
    case 'upload-image':
        require 'upload-image.php';
        break;
    case 'test':
        require 'test.php';
        break;
    default:
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Endpoint not found']);
        break;
}
