const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const restartButton = document.getElementById('restartButton');

// Game variables
const gridSize = 20; // Size of each square on the grid
let initialCanvasWidth = 400; // Initial canvas width
let initialCanvasHeight = 400; // Initial canvas height
const shrinkAmount = 20; // How many pixels to shrink per side (total 40px width/height)
const minCanvasSize = 100; // Minimum size for the canvas (e.g., 5x5 grid cells)

let snake; // Stores objects like { x, y, prevX, prevY }
let food; // Stores { x, y, prevX, prevY }
let direction; // Snake direction
let foodDirection; // Food direction
let score;
let gameLogicInterval; // Interval for snake's logical updates
let foodMoveInterval; // Interval for food's logical updates
let animationFrameId;  // ID for requestAnimationFrame
let baseGameSpeed = 150; // Original milliseconds per snake logical frame
let gameSpeed = baseGameSpeed; // Current milliseconds per snake logical frame
const speedIncreaseAmount = 5; // How much to decrease gameSpeed by (increase speed)
const minGameSpeed = 50; // Minimum game speed to prevent it from becoming too fast
const foodSpeed = 100; // Milliseconds per food logical frame (lower means faster food sprints)
const fleeDistance = gridSize * 2; // Distance (in pixels) at which food starts to flee (e.g., 40 pixels for 20px grid)
const sprintDuration = 500; // Duration of the sprint boost in milliseconds
const sprintSpeedMultiplier = 0.4; // How much faster the snake gets (e.g., 0.4 means 40% of original speed, i.e., 2.5x faster)
let lastUpdateTime;  // Timestamp of the last logical update for snake
let lastFoodUpdateTime; // Timestamp of the last logical update for food
let isGameOver;
let randomSprintsRemaining; // Tracks remaining random sprints for food
const maxRandomSprints = 1; // Ball sprints away randomly only ONE time
let foodChaseStartTime = null; // Timestamp when food started being chased
const minChaseTimeForRandom = 3000; // Minimum chase duration (3 seconds) for random sprint chance
const maxChaseTimeForRandom = 5000; // Maximum chase duration (5 seconds) for random sprint chance

// Helper to check if a position is valid (not wall or snake)
function isValidPosition(x, y, ignoreHead = false) {
    // Check wall collision against CURRENT canvas dimensions
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
        return false;
    }
    // Check snake collision
    for (let i = (ignoreHead ? 1 : 0); i < snake.length; i++) {
        if (snake[i].x === x && snake[i].y === y) {
            return false;
        }
    }
    return true;
}

// Helper to find the best position for food to move to
// Can be used for "fleeing" (adjacent) or "long sprint" (anywhere on board)
function findOptimalFleePosition(currentFoodX, currentFoodY, snakeHead, currentSnakeBody, isLongFlee = false) {
    let possibleMoves = [];
    const snakeBodySet = new Set();
    for (const segment of currentSnakeBody) {
        snakeBodySet.add(`${segment.x},${segment.y}`);
    }

    if (isLongFlee) {
        // For long flee, consider all empty spots on the board
        for (let x = 0; x < canvas.width; x += gridSize) {
            for (let y = 0; y < canvas.height; y += gridSize) {
                if (!snakeBodySet.has(`${x},${y}`)) {
                    possibleMoves.push({ x, y });
                }
            }
        }
    } else {
        // For regular flee, consider only adjacent empty spots
        const adjacentMoves = [
            { x: currentFoodX, y: currentFoodY - gridSize }, // Up
            { x: currentFoodX, y: currentFoodY + gridSize }, // Down
            { x: currentFoodX - gridSize, y: currentFoodY }, // Left
            { x: currentFoodX + gridSize, y: currentFoodY }  // Right
        ];
        for (const move of adjacentMoves) {
            // Check if the potential move is valid (within bounds and CURRENT canvas dimensions)
            if (isValidPosition(move.x, move.y, true)) {
                possibleMoves.push(move);
            }
        }
    }

    if (possibleMoves.length === 0) {
        return null; // No safe place to move
    }

    let bestPosition = null;
    let maxScore = -Infinity;

    for (const pos of possibleMoves) {
        const dx = pos.x - snakeHead.x;
        const dy = pos.y - snakeHead.y;
        let score = Math.sqrt(dx * dx + dy * dy); // Distance from head

        // Bonus for moving away from snake's current movement direction
        switch (direction) { // Use snake's current direction
            case 'up':    if (pos.y > snakeHead.y) score += 100; break;
            case 'down':  if (pos.y < snakeHead.y) score += 100; break;
            case 'left':  if (pos.x > snakeHead.x) score += 100; break;
            case 'right': if (pos.x < snakeHead.x) score += 100; break;
        }

        // Add a stronger bonus for long flee if applicable
        if (isLongFlee) {
            score += 200; // Significant bonus to prefer far spots
        }

        // A slight penalty for being too close to walls if there are other options
        // Check against CURRENT canvas dimensions
        if ((pos.x === 0 || pos.x === canvas.width - gridSize || pos.y === 0 || pos.y === canvas.height - gridSize)) {
            score -= 20;
        }

        if (score > maxScore) {
            maxScore = score;
            bestPosition = pos;
        }
    }
    return bestPosition;
}

// Function to initialize or reset the game state
function initGame() {
    // Reset canvas size
    canvas.width = initialCanvasWidth;
    canvas.height = initialCanvasHeight;

    // Initial snake position and length
    snake = [
        { x: 5 * gridSize, y: 5 * gridSize, prevX: 4 * gridSize, prevY: 5 * gridSize }, // Head
        { x: 4 * gridSize, y: 5 * gridSize, prevX: 3 * gridSize, prevY: 5 * gridSize }  // Body
    ];
    // Set initial prevX/prevY for snake parts
    for (let i = 0; i < snake.length; i++) {
        snake[i].prevX = snake[i].x;
        snake[i].prevY = snake[i].y;
    }

    food = { x: 0, y: 0, prevX: 0, prevY: 0 }; // Initialize food with prev positions
    direction = 'right'; // Initial snake direction
    foodDirection = ''; // Food starts with no specific direction, finds one
    score = 0;
    scoreDisplay.textContent = score;
    isGameOver = false;
    gameSpeed = baseGameSpeed; // Reset game speed to base
    randomSprintsRemaining = maxRandomSprints; // Reset random sprints count
    foodChaseStartTime = null; // Reset chase start time

    // Hide the message box if it's visible
    messageBox.style.display = 'none';

    // Generate initial food and its prev position
    generateFood(true); // true means initial placement, no prior prevX/Y to consider

    // Clear any existing intervals/animation frames
    if (gameLogicInterval) clearInterval(gameLogicInterval);
    if (foodMoveInterval) clearInterval(foodMoveInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Start the logical game loops
    gameLogicInterval = setInterval(updateSnakeLogic, gameSpeed);
    foodMoveInterval = setInterval(updateFoodLogic, foodSpeed); // Food logic now runs more frequently
    
    lastUpdateTime = performance.now(); // Initialize last update time for snake
    lastFoodUpdateTime = performance.now(); // Initialize last update time for food

    // Start the animation loop
    animate();
}

// Function to generate food at a random position
function generateFood(isInitialPlacement = false) {
    let newFoodX, newFoodY;
    let collisionWithSnake;

    do {
        // Generate random coordinates within CURRENT canvas bounds
        newFoodX = Math.floor(Math.random() * (canvas.width / gridSize)) * gridSize;
        newFoodY = Math.floor(Math.random() * (canvas.height / gridSize)) * gridSize;

        collisionWithSnake = false;
        // Check if new food position collides with any part of the snake
        for (let i = 0; i < snake.length; i++) {
            if (snake[i].x === newFoodX && snake[i].y === newFoodY) {
                collisionWithSnake = true;
                break;
            }
        }
    } while (collisionWithSnake); // Keep generating until no collision with snake

    // Update food's position and previous position for smooth animation
    food.prevX = food.x; // Store current as previous
    food.prevY = food.y;
    food.x = newFoodX; // Set new random position
    food.y = newFoodY;
    
    lastFoodUpdateTime = performance.now(); // Reset food update time
}

// Logical game update function for SNAKE (runs at fixed intervals)
function updateSnakeLogic() {
    if (isGameOver) return;

    // Store current positions as previous positions for interpolation
    for (let i = 0; i < snake.length; i++) {
        snake[i].prevX = snake[i].x;
        snake[i].prevY = snake[i].y;
    }

    // Calculate new head position
    const head = { x: snake[0].x, y: snake[0].y };

    switch (direction) {
        case 'up':    head.y -= gridSize; break;
        case 'down':  head.y += gridSize; break;
        case 'left':  head.x -= gridSize; break;
        case 'right': head.x += gridSize; break;
    }

    // Check for collisions against CURRENT canvas dimensions
    // 1. Wall collision
    if (head.x < 0 || head.x >= canvas.width || head.y < 0 || head.y >= canvas.height) {
        gameOver();
        return;
    }

    // 2. Self-collision (check if head collides with any body segment)
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            gameOver();
            return;
        }
    }

    // Add new head to the beginning of the snake
    snake.unshift({ x: head.x, y: head.y, prevX: snake[0].x, prevY: snake[0].y });

    // Check if food is eaten
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreDisplay.textContent = score;
        
        // Shrink arena
        let newWidth = canvas.width - shrinkAmount * 2; // Shrink from both sides
        let newHeight = canvas.height - shrinkAmount * 2;

        // Ensure canvas doesn't shrink below minimum size
        newWidth = Math.max(minCanvasSize, newWidth);
        newHeight = Math.max(minCanvasSize, newHeight);

        // Update canvas dimensions
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Reposition snake and food if they are outside new boundaries
        // Snake repositioning
        for (let i = 0; i < snake.length; i++) {
            snake[i].x = Math.min(snake[i].x, canvas.width - gridSize);
            snake[i].y = Math.min(snake[i].y, canvas.height - gridSize);
            // Ensure they don't go negative (shouldn't happen if they start positive)
            snake[i].x = Math.max(0, snake[i].x);
            snake[i].y = Math.max(0, snake[i].y);
        }
        // Food repositioning
        food.x = Math.min(food.x, canvas.width - gridSize);
        food.y = Math.min(food.y, canvas.height - gridSize);
        food.x = Math.max(0, food.x);
        food.y = Math.max(0, food.y);

        generateFood(); // Generate new food in a random spot within new bounds

        // New: Increase snake speed after eating food
        gameSpeed = Math.max(minGameSpeed, gameSpeed - speedIncreaseAmount);
        clearInterval(gameLogicInterval); // Clear old interval
        gameLogicInterval = setInterval(updateSnakeLogic, gameSpeed); // Set new interval with updated speed

        // The snake grows here as we don't pop the tail
    } else {
        // Remove tail if food not eaten (snake moves)
        snake.pop();
    }

    lastUpdateTime = performance.now(); // Record time of this logical update
}

// Logical game update function for FOOD (runs at its own fixed intervals)
function updateFoodLogic() {
    if (isGameOver) return;

    const head = snake[0];
    const foodCurrentPos = { x: food.x, y: food.y }; // Use food's current logical position
    const currentTime = performance.now();

    // Calculate distance between snake head and food
    const dx = foodCurrentPos.x - head.x;
    const dy = foodCurrentPos.y - head.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if snake is within fleeDistance
    if (distance <= fleeDistance) {
        // If foodChaseStartTime is null, set it (snake just started chasing)
        if (foodChaseStartTime === null) {
            foodChaseStartTime = currentTime;
        }

        // Check for Random Long Sprint - ONLY if randomSprintsRemaining > 0 AND chase duration is met
        const chaseDuration = currentTime - foodChaseStartTime;
        const minChaseTime = 3000; // 3 seconds
        const maxChaseTime = 5000; // 5 seconds
        const randomSprintChance = 0.05; // 5% chance per food update interval within the window

        if (randomSprintsRemaining > 0 && chaseDuration >= minChaseTime && chaseDuration <= maxChaseTime && Math.random() < randomSprintChance) {
            const newFoodPos = findOptimalFleePosition(food.x, food.y, snake[0], snake, true); // true for isLongFlee
            if (newFoodPos) {
                food.prevX = food.x;
                food.prevY = food.y;
                food.x = newFoodPos.x;
                food.y = newFoodPos.y;
                lastFoodUpdateTime = performance.now();
                randomSprintsRemaining--; // Decrement sprint count
                foodChaseStartTime = null; // Reset chase time after a random sprint
                return; // Food moved due to random long sprint
            }
        }

        // Proximity Sprint (Regular Flee)
        const newFoodPos = findOptimalFleePosition(food.x, food.y, snake[0], snake, false); // false for isLongFlee
        if (newFoodPos) {
            food.prevX = food.x;
            food.prevY = food.y;
            food.x = newFoodPos.x;
            food.y = newFoodPos.y;
            lastFoodUpdateTime = performance.now();
        }
    } else {
        // Snake is NOT within fleeDistance, so reset foodChaseStartTime
        foodChaseStartTime = null;
        // Food stays put
        food.prevX = food.x;
        food.prevY = food.y;
        lastFoodUpdateTime = currentTime; // Keep update time current
    }
}


// Animation loop (runs as fast as browser allows)
function animate() {
    if (isGameOver) return;

    const currentTime = performance.now();

    // Interpolation factor for snake
    const snakeElapsedTime = currentTime - lastUpdateTime;
    const snakeInterpolationFactor = Math.min(1, snakeElapsedTime / gameSpeed);

    // Interpolation factor for food
    const foodElapsedTime = currentTime - lastFoodUpdateTime;
    const foodInterpolationFactor = Math.min(1, foodElapsedTime / foodSpeed);

    draw(snakeInterpolationFactor, foodInterpolationFactor); // Draw with interpolated positions

    animationFrameId = requestAnimationFrame(animate); // Request next frame
}

// Function to draw everything on the canvas
// Now accepts two interpolation factors
function draw(snakeInterpolationFactor, foodInterpolationFactor) {
    // Clear the canvas for redrawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the food
    // Interpolate food position
    const displayFoodX = food.prevX + (food.x - food.prevX) * foodInterpolationFactor;
    const displayFoodY = food.prevY + (food.y - food.prevY) * foodInterpolationFactor;

    ctx.fillStyle = '#e74c3c'; // Red for food
    ctx.strokeStyle = '#c0392b'; // Darker red border
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(displayFoodX + gridSize / 2, displayFoodY + gridSize / 2, gridSize / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw the snake as a continuous path (using snakeInterpolationFactor)
    ctx.strokeStyle = '#c0392b'; /* Darker red border for snake */
    ctx.lineWidth = gridSize - 4; /* Make the line thick, almost filling the grid cell */
    ctx.lineCap = 'round'; /* Rounded ends for the path */
    ctx.lineJoin = 'round'; /* Rounded corners when the snake turns */

    ctx.beginPath();

    for (let i = 0; i < snake.length; i++) {
        const displayX = snake[i].prevX + (snake[i].x - snake[i].prevX) * snakeInterpolationFactor;
        const displayY = snake[i].prevY + (snake[i].y - snake[i].prevY) * snakeInterpolationFactor;

        const centerX = displayX + gridSize / 2;
        const centerY = displayY + gridSize / 2;

        if (i === 0) {
            ctx.moveTo(centerX, centerY); // Start path at the head
        } else {
            ctx.lineTo(centerX, centerY); // Draw line to subsequent segments
        }
    }

    ctx.stroke(); // Draw the thick, smooth line

    // Now draw the fill color on top, slightly smaller to show the stroke
    ctx.fillStyle = '#e74c3c'; /* Red for body */
    ctx.lineWidth = gridSize - 8; /* Slightly thinner fill */
    ctx.beginPath();
    for (let i = 0; i < snake.length; i++) {
        const displayX = snake[i].prevX + (snake[i].x - snake[i].prevX) * snakeInterpolationFactor;
        const displayY = snake[i].prevY + (snake[i].y - snake[i].prevY) * snakeInterpolationFactor;
        const centerX = displayX + gridSize / 2;
        const centerY = displayY + gridSize / 2;

        if (i === 0) {
            ctx.moveTo(centerX, centerY);
        } else {
            ctx.lineTo(centerX, centerY);
        }
    }
    ctx.stroke(); // Draw the filled path

    // Draw the head (slightly darker red) on top
    const headX = snake[0].prevX + (snake[0].x - snake[0].prevX) * snakeInterpolationFactor;
    const headY = snake[0].prevY + (snake[0].y - snake[0].prevY) * snakeInterpolationFactor;
    const headCenterX = headX + gridSize / 2;
    const headCenterY = headY + gridSize / 2;
    const headRadius = (gridSize - 4) / 2; // Match line width radius

    ctx.fillStyle = '#c0392b'; /* Darker red for the head */
    ctx.beginPath();
    ctx.arc(headCenterX, headCenterY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke(); // To maintain the border around the head

    // Draw eyes on the head
    ctx.fillStyle = 'white'; // White for eye sclera
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;

    const eyeSize = headRadius / 3;
    const pupilSize = eyeSize / 2;
    const eyeSpacing = headRadius / 2.5;

    // Adjust eye position based on current snake direction
    switch (direction) {
        case 'up':
            ctx.beginPath(); // Left eye
            ctx.arc(headCenterX - eyeSpacing, headCenterY - eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); // Right eye
            ctx.arc(headCenterX + eyeSpacing, headCenterY - eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = 'black'; // Pupils
            ctx.beginPath();
            ctx.arc(headCenterX - eyeSpacing, headCenterY - eyeSpacing - eyeSize/2, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(headCenterX + eyeSpacing, headCenterY - eyeSpacing - eyeSize/2, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'down':
            ctx.beginPath(); // Left eye
            ctx.arc(headCenterX - eyeSpacing, headCenterY + eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); // Right eye
            ctx.arc(headCenterX + eyeSpacing, headCenterY + eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = 'black'; // Pupils
            ctx.beginPath();
            ctx.arc(headCenterX - eyeSpacing, headCenterY + eyeSpacing + eyeSize/2, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(headCenterX + eyeSpacing, headCenterY + eyeSpacing + eyeSize/2, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'left':
            ctx.beginPath(); // Top eye
            ctx.arc(headCenterX - eyeSpacing, headCenterY - eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); // Bottom eye
            ctx.arc(headCenterX - eyeSpacing, headCenterY + eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = 'black'; // Pupils
            ctx.beginPath();
            ctx.arc(headCenterX - eyeSpacing - eyeSize/2, headCenterY - eyeSpacing, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(headCenterX - eyeSpacing - eyeSize/2, headCenterY + eyeSpacing, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'right':
            ctx.beginPath(); // Top eye
            ctx.arc(headCenterX + eyeSpacing, headCenterY - eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); // Bottom eye
            ctx.arc(headCenterX + eyeSpacing, headCenterY + eyeSpacing, eyeSize, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = 'black'; // Pupils
            ctx.beginPath();
            ctx.arc(headCenterX + eyeSpacing + eyeSize/2, headCenterY - eyeSpacing, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(headCenterX + eyeSpacing + eyeSize/2, headCenterY + eyeSpacing, pupilSize, 0, Math.PI * 2);
            ctx.fill();
            break;
            }
        }

        // Function to handle game over
        function gameOver() {
            isGameOver = true;
            clearInterval(gameLogicInterval); // Stop the snake logical game loop
            clearInterval(foodMoveInterval); // Stop the food logical game loop
            cancelAnimationFrame(animationFrameId); // Stop the animation loop
            messageText.textContent = `Game Over! Your score: ${score}`;
            messageBox.style.display = 'flex'; // Show the message box (using flex for centering)
        }

        // Event listener for keyboard input
        document.addEventListener('keydown', e => {
            if (isGameOver) return; // Don't allow input if game is over

            // Prevent immediate reverse direction
            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                    if (direction !== 'down') direction = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                    if (direction !== 'up') direction = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                    if (direction !== 'right') direction = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                    if (direction !== 'left') direction = 'right';
                    break;
                case ' ': // Spacebar for sprint boost (now unlimited)
                    gameSpeed = baseGameSpeed * sprintSpeedMultiplier; // Speed up
                    
                    // Clear existing interval and start a new one with increased speed
                    clearInterval(gameLogicInterval);
                    gameLogicInterval = setInterval(updateSnakeLogic, gameSpeed);

                    // Set a timeout to revert speed after sprintDuration
                    setTimeout(() => {
                        gameSpeed = baseGameSpeed; // Revert to normal speed
                        clearInterval(gameLogicInterval);
                        gameLogicInterval = setInterval(updateSnakeLogic, gameSpeed);
                    }, sprintDuration);
                    break;
            }
        });

        // Event listener for restart button
        restartButton.addEventListener('click', initGame);

        // Initial setup: Start the game directly on window load
        window.onload = initGame;