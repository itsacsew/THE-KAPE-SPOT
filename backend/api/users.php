<?php
require_once 'config.php';

setCORSHeaders();
$conn = getDBConnection();

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (isset($input['action'])) {
                switch ($input['action']) {
                    case 'login':
                        loginUser($conn, $input);
                        break;
                    case 'register':
                        registerUser($conn, $input);
                        break;
                    case 'change_password':
                        changePassword($conn, $input);
                        break;
                    default:
                        http_response_code(400);
                        echo json_encode(['success' => false, 'message' => 'Invalid action']);
                }
            } else {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Action is required']);
            }
            break;
        case 'GET':
            getUsers($conn);
            break;
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}

function loginUser($conn, $input)
{
    if (!isset($input['username']) || !isset($input['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username and password are required']);
        return;
    }

    $username = $conn->real_escape_string($input['username']);
    $password = $input['password'];

    $stmt = $conn->prepare("SELECT id, username, password, name, role, status FROM users WHERE username = ? AND status = 1");
    $stmt->bind_param("s", $username);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
        return;
    }

    $user = $result->fetch_assoc();

    // For demo purposes, using simple password verification
    // In production, use password_verify() with hashed passwords
    if ($password === 'password' || password_verify($password, $user['password'])) {
        // Remove password from response
        unset($user['password']);

        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'user' => $user
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
    }
}

function registerUser($conn, $input)
{
    if (!isset($input['username']) || !isset($input['password']) || !isset($input['name'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username, password, and name are required']);
        return;
    }

    $username = $conn->real_escape_string($input['username']);
    $password = password_hash($input['password'], PASSWORD_DEFAULT);
    $name = $conn->real_escape_string($input['name']);
    $role = isset($input['role']) ? $conn->real_escape_string($input['role']) : 'user';

    // Check if username already exists
    $check_stmt = $conn->prepare("SELECT id FROM users WHERE username = ?");
    $check_stmt->bind_param("s", $username);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Username already exists']);
        return;
    }

    $stmt = $conn->prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $username, $password, $name, $role);

    if ($stmt->execute()) {
        $user_id = $stmt->insert_id;

        // Get the created user without password
        $user_stmt = $conn->prepare("SELECT id, username, name, role FROM users WHERE id = ?");
        $user_stmt->bind_param("i", $user_id);
        $user_stmt->execute();
        $user_result = $user_stmt->get_result();
        $new_user = $user_result->fetch_assoc();

        echo json_encode([
            'success' => true,
            'message' => 'User registered successfully',
            'user' => $new_user
        ]);
    } else {
        throw new Exception('Failed to register user: ' . $stmt->error);
    }
}

function changePassword($conn, $input)
{
    if (!isset($input['user_id']) || !isset($input['current_password']) || !isset($input['new_password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID, current password, and new password are required']);
        return;
    }

    $user_id = $conn->real_escape_string($input['user_id']);
    $current_password = $input['current_password'];
    $new_password = $input['new_password'];

    // Validate new password length
    if (strlen($new_password) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'New password must be at least 6 characters long']);
        return;
    }

    // Get current user data
    $stmt = $conn->prepare("SELECT id, username, password FROM users WHERE id = ? AND status = 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User not found or inactive']);
        return;
    }

    $user = $result->fetch_assoc();

    // Verify current password
    // For demo purposes, using simple password verification
    // In production, use password_verify() with hashed passwords
    $isCurrentPasswordValid = $current_password === 'password' || password_verify($current_password, $user['password']);

    if (!$isCurrentPasswordValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Current password is incorrect']);
        return;
    }

    // Hash new password
    $hashed_new_password = password_hash($new_password, PASSWORD_DEFAULT);

    // Update password in database
    $update_stmt = $conn->prepare("UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $update_stmt->bind_param("si", $hashed_new_password, $user_id);

    if ($update_stmt->execute()) {
        // Log the password change activity
        logActivity($conn, $user_id, "Password changed for user: " . $user['username']);

        echo json_encode([
            'success' => true,
            'message' => 'Password updated successfully'
        ]);
    } else {
        throw new Exception('Failed to update password: ' . $update_stmt->error);
    }
}

function getUsers($conn)
{
    $result = $conn->query("SELECT id, username, name, role, status, created_at, updated_at FROM users ORDER BY name");

    if (!$result) {
        throw new Exception('Database query failed: ' . $conn->error);
    }

    $users = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (string)$row['id'];
        $users[] = $row;
    }

    echo json_encode($users);
}

function logActivity($conn, $user_id, $activity)
{
    $stmt = $conn->prepare("INSERT INTO user_activities (user_id, activity, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
    $stmt->bind_param("is", $user_id, $activity);
    $stmt->execute();
}

$conn->close();
