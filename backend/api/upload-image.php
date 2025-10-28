<?php
require_once 'config.php';

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

setCORSHeaders();

header('Content-Type: application/json');

try {
    $conn = getDBConnection();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        exit;
    }

    if (!isset($_POST['item_id']) || !isset($_FILES['image'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Item ID and image are required']);
        exit;
    }

    $item_id = intval($_POST['item_id']);

    // Check if item exists
    $check_stmt = $conn->prepare("SELECT id FROM items WHERE id = ?");
    $check_stmt->bind_param("i", $item_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Item not found']);
        exit;
    }

    $uploadDir = '../uploads/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0777, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to create upload directory']);
            exit;
        }
    }

    $image = $_FILES['image'];

    // Check for upload errors
    if ($image['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'File upload error: ' . $image['error']]);
        exit;
    }

    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $image['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $allowedTypes)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid file type. Only JPEG, PNG, and GIF are allowed.']);
        exit;
    }

    // Validate file size (max 5MB)
    if ($image['size'] > 5 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'File too large. Maximum size is 5MB.']);
        exit;
    }

    // Generate unique filename
    $fileExtension = pathinfo($image['name'], PATHINFO_EXTENSION);
    $filename = 'item_' . $item_id . '_' . uniqid() . '.' . $fileExtension;
    $filepath = $uploadDir . $filename;

    if (move_uploaded_file($image['tmp_name'], $filepath)) {
        // Update item in database with image filename
        $update_stmt = $conn->prepare("UPDATE items SET image = ? WHERE id = ?");
        $update_stmt->bind_param("si", $filename, $item_id);

        if ($update_stmt->execute()) {
            echo json_encode([
                'success' => true,
                'filename' => $filename,
                'message' => 'Image uploaded and updated successfully'
            ]);
        } else {
            // Delete the uploaded file if database update fails
            unlink($filepath);
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to update item with image: ' . $update_stmt->error]);
        }
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to upload image. Check directory permissions.']);
    }

    $conn->close();
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Exception: ' . $e->getMessage()]);
}
