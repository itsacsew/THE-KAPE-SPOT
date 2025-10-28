<?php
require_once 'config.php';

setCORSHeaders();
$conn = getDBConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        getItems($conn);
        break;
    case 'POST':
        // Check if it's form data (image upload) or JSON (item creation)
        if (isset($_FILES['image'])) {
            uploadItemImage($conn);
        } else {
            addItem($conn);
        }
        break;
    case 'PUT':
        updateItem($conn);
        break;
    case 'DELETE':
        deleteItem($conn);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}

function getItems($conn)
{
    $result = $conn->query("
        SELECT id, code, name, price, category, stocks, sales, status, description, image 
        FROM items 
        ORDER BY created_at DESC
    ");

    $items = [];
    while ($row = $result->fetch_assoc()) {
        // Convert id to string for consistency with frontend
        $row['id'] = (string)$row['id'];
        $items[] = $row;
    }

    echo json_encode($items);
}

function addItem($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['name']) || !isset($input['code']) || !isset($input['price']) || !isset($input['category'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing required fields']);
        return;
    }

    $code = $conn->real_escape_string($input['code']);
    $name = $conn->real_escape_string($input['name']);
    $price = floatval($input['price']);
    $category = $conn->real_escape_string($input['category']);
    $stocks = isset($input['stocks']) ? intval($input['stocks']) : 0;
    $description = isset($input['description']) ? $conn->real_escape_string($input['description']) : '';
    $status = isset($input['status']) ? (bool)$input['status'] : true;
    $sales = isset($input['sales']) ? intval($input['sales']) : 0;

    // Check if code already exists
    $check_stmt = $conn->prepare("SELECT id FROM items WHERE code = ?");
    $check_stmt->bind_param("s", $code);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Item code already exists']);
        return;
    }

    $stmt = $conn->prepare("
        INSERT INTO items (code, name, price, category, stocks, description, status, sales) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->bind_param("ssdsisii", $code, $name, $price, $category, $stocks, $description, $status, $sales);

    if ($stmt->execute()) {
        $item_id = $stmt->insert_id;
        echo json_encode([
            'success' => true,
            'message' => 'Item added successfully',
            'item_id' => $item_id,  // Added item_id for image upload
            'id' => $item_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to add item: ' . $stmt->error]);
    }
}

function uploadItemImage($conn)
{
    header('Content-Type: application/json');

    if (!isset($_POST['item_id']) || !isset($_FILES['image'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Item ID and image are required']);
        return;
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
        return;
    }

    $uploadDir = '../uploads/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0777, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to create upload directory']);
            return;
        }
    }

    $image = $_FILES['image'];

    // Check for upload errors
    if ($image['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'File upload error: ' . $image['error']]);
        return;
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
}

function updateItem($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Item ID is required']);
        return;
    }

    $id = intval($input['id']);
    $status = isset($input['status']) ? (bool)$input['status'] : true;

    $stmt = $conn->prepare("UPDATE items SET status = ? WHERE id = ?");
    $stmt->bind_param("ii", $status, $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Item updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update item']);
    }
}

function deleteItem($conn)
{
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Item ID is required']);
        return;
    }

    $id = intval($_GET['id']);

    // First, get the image filename to delete the file
    $select_stmt = $conn->prepare("SELECT image FROM items WHERE id = ?");
    $select_stmt->bind_param("i", $id);
    $select_stmt->execute();
    $result = $select_stmt->get_result();
    $item = $result->fetch_assoc();

    $stmt = $conn->prepare("DELETE FROM items WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        // Delete the image file if it exists
        if ($item && $item['image']) {
            $imagePath = '../uploads/' . $item['image'];
            if (file_exists($imagePath)) {
                unlink($imagePath);
            }
        }
        echo json_encode(['success' => true, 'message' => 'Item deleted successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete item']);
    }
}

$conn->close();
