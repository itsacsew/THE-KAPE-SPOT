<?php
require_once 'config.php';

setCORSHeaders();
$conn = getDBConnection();

// Set JSON header first
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            getCategories($conn);
            break;
        case 'POST':
            addCategory($conn);
            break;
        case 'PUT':
            updateCategory($conn);
            break;
        case 'DELETE':
            deleteCategory($conn);
            break;
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}

function getCategories($conn)
{
    // Check if icon column exists
    $column_check = $conn->query("SHOW COLUMNS FROM categories LIKE 'icon'");
    $has_icon_column = $column_check->num_rows > 0;

    if ($has_icon_column) {
        $result = $conn->query("SELECT id, name, icon, created_at FROM categories ORDER BY name");
    } else {
        $result = $conn->query("SELECT id, name, created_at FROM categories ORDER BY name");
    }

    if (!$result) {
        throw new Exception('Database query failed: ' . $conn->error);
    }

    $categories = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (string)$row['id'];

        // If icon column doesn't exist, set default value
        if (!$has_icon_column) {
            $row['icon'] = 'folder';
        }

        $categories[] = $row;
    }

    echo json_encode($categories);
}

function addCategory($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['name'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Category name is required']);
        return;
    }

    $name = $conn->real_escape_string($input['name']);

    // Check if icon column exists and get the value
    $icon = 'folder'; // Default value
    if (isset($input['icon'])) {
        $icon = $conn->real_escape_string($input['icon']);
    }

    // Check if category already exists
    $check_stmt = $conn->prepare("SELECT id FROM categories WHERE name = ?");
    $check_stmt->bind_param("s", $name);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Category already exists']);
        return;
    }

    // Check if icon column exists in the table
    $column_check = $conn->query("SHOW COLUMNS FROM categories LIKE 'icon'");
    if ($column_check->num_rows > 0) {
        // Icon column exists, include it in the insert
        $stmt = $conn->prepare("INSERT INTO categories (name, icon) VALUES (?, ?)");
        $stmt->bind_param("ss", $name, $icon);
    } else {
        // Icon column doesn't exist, insert without it
        $stmt = $conn->prepare("INSERT INTO categories (name) VALUES (?)");
        $stmt->bind_param("s", $name);
    }

    if ($stmt->execute()) {
        $category_id = $stmt->insert_id;

        // Return the created category data including icon
        $response = [
            'success' => true,
            'message' => 'Category added successfully',
            'category_id' => $category_id,
            'id' => $category_id
        ];

        // Include icon in response if it was set
        if (isset($input['icon'])) {
            $response['icon'] = $input['icon'];
        }

        echo json_encode($response);
    } else {
        throw new Exception('Failed to add category: ' . $stmt->error);
    }
}

function updateCategory($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Category ID is required']);
        return;
    }

    $id = intval($input['id']);
    $name = $conn->real_escape_string($input['name']);
    $icon = isset($input['icon']) ? $conn->real_escape_string($input['icon']) : 'folder';

    $stmt = $conn->prepare("UPDATE categories SET name = ?, icon = ? WHERE id = ?");
    $stmt->bind_param("ssi", $name, $icon, $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Category updated successfully']);
    } else {
        throw new Exception('Failed to update category: ' . $stmt->error);
    }
}

function deleteCategory($conn)
{
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Category ID is required']);
        return;
    }

    $id = intval($_GET['id']);

    $stmt = $conn->prepare("DELETE FROM categories WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Category deleted successfully']);
    } else {
        throw new Exception('Failed to delete category: ' . $stmt->error);
    }
}

$conn->close();
