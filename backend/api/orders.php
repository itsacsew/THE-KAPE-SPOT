<?php
// backend/api/orders.php
require_once 'config.php';

setCORSHeaders();
$conn = getDBConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        getOrders($conn);
        break;
    case 'POST':
        createOrder($conn);
        break;
    case 'PUT':
        updateOrderStatus($conn);
        break;
    case 'DELETE':
        deleteOrder($conn);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}

function getOrders($conn)
{
    $result = $conn->query("
        SELECT id, order_id, customer_name, items, subtotal, total, status, created_at 
        FROM orders 
        ORDER BY created_at DESC
    ");

    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (string)$row['id'];
        $row['items'] = json_decode($row['items'], true);
        $orders[] = $row;
    }

    echo json_encode($orders);
}

function createOrder($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['customerName']) || !isset($input['items'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Customer name and items are required']);
        return;
    }

    $order_id = $conn->real_escape_string($input['orderId']);
    $customer_name = $conn->real_escape_string($input['customerName']);
    $items = json_encode($input['items']);
    $subtotal = floatval($input['subtotal']);
    $total = floatval($input['total']);
    $status = 'unpaid';
    $timestamp = date('Y-m-d H:i:s');

    // Check if order already exists
    $check_stmt = $conn->prepare("SELECT id FROM orders WHERE order_id = ?");
    $check_stmt->bind_param("s", $order_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Order ID already exists']);
        return;
    }

    $stmt = $conn->prepare("
        INSERT INTO orders (order_id, customer_name, items, subtotal, total, status, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->bind_param("sssddss", $order_id, $customer_name, $items, $subtotal, $total, $status, $timestamp);

    if ($stmt->execute()) {
        $order_db_id = $stmt->insert_id;
        echo json_encode([
            'success' => true,
            'message' => 'Order created successfully',
            'order_id' => $order_db_id,
            'id' => $order_db_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to create order: ' . $stmt->error]);
    }
}

function updateOrderStatus($conn)
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['orderId']) || !isset($input['status'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Order ID and status are required']);
        return;
    }

    $order_id = $conn->real_escape_string($input['orderId']);
    $status = $conn->real_escape_string($input['status']);

    $stmt = $conn->prepare("UPDATE orders SET status = ? WHERE order_id = ?");
    $stmt->bind_param("ss", $status, $order_id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Order status updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update order status']);
    }
}

function deleteOrder($conn)
{
    if (!isset($_GET['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Order ID is required']);
        return;
    }

    $id = intval($_GET['id']);

    $stmt = $conn->prepare("DELETE FROM orders WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Order deleted successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete order']);
    }
}

$conn->close();
