<?php
require_once 'config.php';

setCORSHeaders();
$conn = getDBConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        getCups($conn);
        break;
    case 'POST':
        addCup($conn);
        break;
    case 'PUT':
        updateCup($conn);
        break;
    case 'DELETE':
        deleteCup($conn);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}

function getCups($conn)
{
    $result = $conn->query("
        SELECT id, name, size, stocks, status 
        FROM cups 
        ORDER BY name
    ");

    $cups = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (string)$row['id'];
        $cups[] = $row;
    }

    echo json_encode($cups);
}

function addCup($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['name']) || !isset($input['stocks'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Name and stocks are required']);
        return;
    }

    $name = $conn->real_escape_string($input['name']);
    $size = isset($input['size']) ? $conn->real_escape_string($input['size']) : '';
    $stocks = intval($input['stocks']);
    $status = isset($input['status']) ? (bool)$input['status'] : true;

    // Check if cup name already exists
    $check_stmt = $conn->prepare("SELECT id FROM cups WHERE name = ?");
    $check_stmt->bind_param("s", $name);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Cup name already exists']);
        return;
    }

    $stmt = $conn->prepare("INSERT INTO cups (name, size, stocks, status) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssii", $name, $size, $stocks, $status);

    if ($stmt->execute()) {
        $cup_id = $stmt->insert_id;
        echo json_encode([
            'success' => true,
            'message' => 'Cup added successfully',
            'cup_id' => $cup_id,
            'id' => $cup_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to add cup: ' . $stmt->error]);
    }
}

function updateCup($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Cup ID is required']);
        return;
    }

    $id = intval($input['id']);

    // Build dynamic update query based on provided fields
    $updates = [];
    $params = [];
    $types = '';

    if (isset($input['name'])) {
        $updates[] = "name = ?";
        $params[] = $conn->real_escape_string($input['name']);
        $types .= "s";
    }

    if (isset($input['size'])) {
        $updates[] = "size = ?";
        $params[] = $conn->real_escape_string($input['size']);
        $types .= "s";
    }

    if (isset($input['stocks'])) {
        $updates[] = "stocks = ?";
        $params[] = intval($input['stocks']);
        $types .= "i";
    }

    if (isset($input['status'])) {
        $updates[] = "status = ?";
        $params[] = (bool)$input['status'];
        $types .= "i";
    }

    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No fields to update']);
        return;
    }

    $params[] = $id;
    $types .= "i";

    $sql = "UPDATE cups SET " . implode(', ', $updates) . " WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Cup updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update cup: ' . $stmt->error]);
    }
}

function deleteCup($conn)
{
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Cup ID is required']);
        return;
    }

    $id = intval($_GET['id']);

    $stmt = $conn->prepare("DELETE FROM cups WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Cup deleted successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete cup']);
    }
}

$conn->close();
