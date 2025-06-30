// --- START OF FILE app.js ---

// --- START OF REVISED app.js ---

let processes = [];
let processIdCounter = 0;
let simulationInterval = null;
let ganttChartData = [];
let currentTime = 0;
let completedProcesses = []; // Stores completed process objects
let readyQueue = [];       // Stores process objects ready to run (in runSimulation)
let runningProcess = null; // Stores the currently running process object (in runSimulation)
let simulationSpeed = 500; // ms per time unit
const GANTT_SCALE = 20; // pixels per time unit

// --- Process Management (updateInputFields, addProcessRow, deleteProcess, updateProcess, addSampleProcesses) ---
function updateInputFields() {
    const selectedAlgo = document.getElementById("algo").value;
    const showPriority = selectedAlgo.includes("priority");
    const showTimeQuantum = selectedAlgo === "round-robin";

    document.getElementById("priorityHeader").style.display = showPriority ? "table-cell" : "none";
    document.getElementById("priorityResultHeader").style.display = showPriority ? "table-cell" : "none";
    document.querySelectorAll('.priority-input-cell').forEach(cell => cell.style.display = showPriority ? "table-cell" : "none");
    document.querySelectorAll('.priority-result-cell').forEach(cell => cell.style.display = showPriority ? "table-cell" : "none");

    document.getElementById("timeQuantumContainer").style.display = showTimeQuantum ? "block" : "none";
}

function addProcessRow() {
    processIdCounter++;
    const processID = processIdCounter;
    const selectedAlgo = document.getElementById("algo").value;
    const showPriority = selectedAlgo.includes("priority");

    const process = {
        id: processID,
        displayId: `P${processID}`,
        arrival: 0,
        burst: 1, // Default burst to 1
        priority: showPriority ? 0 : null,
        color: getRandomColor(),
        // Simulation state
        originalBurst: 1, // Store original burst time separately
        remainingBurst: 1, // Initialize remainingBurst based on burst
        completion: null,
        turnaround: null,
        waiting: 0,
        startTime: null,
        state: 'new',
        quantumLeft: 0
    };
    // process.remainingBurst = process.burst; // Redundant due to initialization above
    // process.originalBurst = process.burst; // Redundant due to initialization above

    processes.push(process);


    const tableBody = document.querySelector("#processTable tbody");
    const row = document.createElement("tr");
    row.setAttribute("id", `processRow-${processID}`);
    row.innerHTML = `
      <td>${process.displayId}</td>
      <td><input type="number" min="0" value="${process.arrival}" oninput="updateProcess(${processID}, 'arrival', this.value)"></td>
      <td><input type="number" min="1" value="${process.burst}" oninput="updateProcess(${processID}, 'burst', this.value)"></td>
      <td class="priority-input-cell" style="display: ${showPriority ? "table-cell" : "none"};">
          <input type="number" min="0" value="${process.priority !== null ? process.priority : ''}" oninput="updateProcess(${processID}, 'priority', this.value)">
      </td>
      <td><button onclick="deleteProcess(${processID})">Delete</button></td>
    `;
    tableBody.appendChild(row);
    updateInputFields(); // Ensure priority column visibility is updated if needed
}

function deleteProcess(id) {
    processes = processes.filter(p => p.id !== id);
    const row = document.getElementById(`processRow-${id}`);
    if (row) row.remove();
    // If the last process was deleted, maybe reset counter? Optional.
    // if (processes.length === 0) processIdCounter = 0;
}

function updateProcess(id, key, value) {
    const process = processes.find(p => p.id === id);
    if (process) {
        let numValue = parseInt(value);
        const minValue = (key === 'burst' ? 1 : 0); // Burst must be >= 1
        if (isNaN(numValue) || numValue < minValue) {
           console.warn(`Invalid input for ${key}: ${value}. Setting to minimum ${minValue}.`);
           numValue = minValue;
           // Update the input field visually to reflect the correction
            const row = document.getElementById(`processRow-${id}`);
            if(row) {
                let inputElement;
                if(key === 'arrival') inputElement = row.cells[1].querySelector('input');
                else if(key === 'burst') inputElement = row.cells[2].querySelector('input');
                else if(key === 'priority') inputElement = row.cells[3].querySelector('input');
                if (inputElement) {
                    inputElement.value = numValue;
                }
            }
        }
        process[key] = numValue;

        // Crucially, update originalBurst and remainingBurst if burst time changes
        // This should only happen here, not during simulation reset, as user might change it *before* running
        if (key === 'burst') {
            process.originalBurst = numValue;
            process.remainingBurst = numValue;
        }
    }
}

function addSampleProcesses() {
    // Clear existing processes before adding sample data
    document.querySelector("#processTable tbody").innerHTML = '';
    processes = [];
    processIdCounter = 0;
    // Reset results/visualization as well
    resetSimulation(); // Call resetSimulation to ensure clean state

    const sampleData = [
        { arrival: 0, burst: 8, priority: 3 },
        { arrival: 1, burst: 4, priority: 1 },
        { arrival: 2, burst: 9, priority: 4 },
        { arrival: 3, burst: 5, priority: 2 },
        { arrival: 4, burst: 1, priority: 5 }, // Added burst 1 example
    ];
    sampleData.forEach(data => {
        addProcessRow(); // This increments counter and adds row/process object
        const newProcess = processes[processes.length - 1];
        // Use updateProcess to set values and ensure consistency
        updateProcess(newProcess.id, 'arrival', data.arrival);
        updateProcess(newProcess.id, 'burst', data.burst);
        if (data.priority !== undefined) { // Only update priority if it exists in sample
             updateProcess(newProcess.id, 'priority', data.priority);
        }
    });
    updateInputFields(); // Update visibility based on selected algorithm
}


// --- Simulation Logic ---

function resetSimulation() {
    clearInterval(simulationInterval);
    simulationInterval = null;
    // Don't clear processes array or counter here, only clear the table rows visually
    // processes = [];
    // processIdCounter = 0;
    ganttChartData = [];
    readyQueue = []; // Simulation queue
    completedProcesses = [];
    runningProcess = null;
    currentTime = 0;

    // Clear table visually but keep 'processes' array intact for re-simulation
    // document.querySelector("#processTable tbody").innerHTML = '';
    document.getElementById("ganttChart").innerHTML = '';
    document.getElementById("timeAxis").innerHTML = '';
    document.getElementById("queueContainer").innerHTML = ''; // Clear visual queue
    document.getElementById("resultsTable tbody").innerHTML = '';
    document.getElementById("executionTime").innerText = "Current Time: 0";
    document.getElementById("timeIndicator").style.left = `0px`;
    document.getElementById("cpuStatus").innerText = "CPU Status: Idle";
    document.getElementById("avgTAT").innerText = "Average Turnaround Time: 0";
    document.getElementById("avgWT").innerText = "Average Waiting Time: 0";

    updateInputFields(); // Ensure correct fields show based on algo selection
}


function resetProcessState() {
    // Reset simulation-specific state for each process in the 'processes' array
    // Uses the *current* values from the input fields (via p.burst, p.arrival etc.)
    processes.forEach(p => {
        p.originalBurst = p.burst; // Re-capture original burst from current input
        p.remainingBurst = p.burst; // Reset remaining burst
        p.completion = null;
        p.turnaround = null;
        p.waiting = 0; // Reset calculated waiting time
        p.startTime = null;
        p.state = 'new';
        p.quantumLeft = 0;
    });
}


function runSimulation() {
     // Validation before starting
    if (processes.length === 0) {
        alert("Please add at least one process.");
        return;
    }
    // Validate existing processes based on current input values
    if (processes.some(p => p.burst < 1 || p.arrival < 0 || (p.priority !== null && p.priority < 0))) {
         alert("Please ensure Arrival Time >= 0, Burst Time >= 1, and Priority >= 0 (if applicable). Correct any invalid values in the table.");
         return;
     }

    clearInterval(simulationInterval); // Stop any previous animation
    resetProcessState(); // Ensure process states are fresh based on current inputs

    const algorithm = document.getElementById("algo").value;
    const timeQuantumInput = document.getElementById("timeQuantum");
    const timeQuantum = parseInt(timeQuantumInput.value);
     if (algorithm === 'round-robin' && (isNaN(timeQuantum) || timeQuantum < 1)) {
         alert("Please enter a valid Time Quantum (>= 1) for Round Robin.");
         // Optionally focus the input: timeQuantumInput.focus();
         return;
     }

    const isPreemptive = algorithm === 'srtf' || algorithm === 'preemptive-priority';

    // Use a deep copy of the main 'processes' array for the simulation pool
    // This ensures the main array (tied to inputs) isn't modified during simulation run
    let simulationProcesses = JSON.parse(JSON.stringify(processes));
    simulationProcesses.sort((a, b) => a.arrival - b.arrival || a.id - b.id); // Sort copy by arrival, then ID
    let processPool = [...simulationProcesses]; // Processes yet to arrive/start

    // Reset simulation variables
    currentTime = 0;
    ganttChartData = [];
    readyQueue = []; // Simulation ready queue
    completedProcesses = []; // Store completed process objects from the simulation copy
    runningProcess = null; // Simulation running process
    let currentGanttBlock = null;
    let simulationRunning = true;
    const MAX_SIMULATION_TIME = 10000; // Increased safety break


    // --- Main Simulation Loop ---
    while (simulationRunning) {

        // 1. Check for arriving processes at the current time
        let newlyArrivedProcesses = [];
        processPool = processPool.filter(p => {
            if (p.arrival <= currentTime) {
                p.state = 'ready';
                newlyArrivedProcesses.push(p);
                return false; // Remove from pool
            }
            return true; // Keep in pool
        });

        // Add newly arrived processes to the ready queue
        if (newlyArrivedProcesses.length > 0) {
             // Sort arrivals by ID for consistent tie-breaking before adding
            newlyArrivedProcesses.sort((a, b) => a.id - b.id);
            newlyArrivedProcesses.forEach(p => {
                 // Add to ready queue (sorting happens before selection, except for RR)
                 readyQueue.push(p);
            });
        }

        // 2. Preemption Check (SRTF/Preemptive Priority)
        // Only check if a process is currently running and new processes have arrived *or* the ready queue has relevant processes
        if (isPreemptive && runningProcess && readyQueue.length > 0) {
             // Sort ready queue *before* checking for preemption
             sortReadyQueue(algorithm);
             const potentialPreemptor = readyQueue[0]; // Highest priority waiting process
             let shouldPreempt = false;

             if (algorithm === 'srtf' && potentialPreemptor.remainingBurst < runningProcess.remainingBurst) {
                 shouldPreempt = true;
             } else if (algorithm === 'preemptive-priority' && potentialPreemptor.priority < runningProcess.priority) {
                 shouldPreempt = true;
             }

             if (shouldPreempt) {
                 // Preempt! Finalize current Gantt block
                 if (currentGanttBlock) {
                     currentGanttBlock.end = currentTime; // Preemption happens *at* current time
                 }
                 runningProcess.state = 'ready';
                 readyQueue.push(runningProcess); // Add running process back to ready queue
                 runningProcess = null; // CPU is now idle (momentarily)
                 currentGanttBlock = null;
                 // The ready queue will be re-sorted before the next selection if needed
             }
        }


        // 3. Select next process if CPU is idle
        if (!runningProcess && readyQueue.length > 0) {
            // Sort the ready queue before selecting (except for RR)
            if (algorithm !== 'round-robin') {
                sortReadyQueue(algorithm);
            }
            runningProcess = readyQueue.shift(); // Get process from front of queue
            runningProcess.state = 'running';

            // Record start time only if it hasn't started before
            if (runningProcess.startTime === null) {
                runningProcess.startTime = currentTime;
            }
            // Set quantum for RR
            if (algorithm === 'round-robin') {
                runningProcess.quantumLeft = timeQuantum;
            }

            // Start new Gantt block
            currentGanttBlock = {
                id: `gantt-${runningProcess.id}-${currentTime}`,
                processId: runningProcess.id,
                start: currentTime,
                end: currentTime + 1, // Initial end time (will be extended)
                color: runningProcess.color, // Use color from the simulation process object
                displayId: runningProcess.displayId
            };
            ganttChartData.push(currentGanttBlock);
        }

        // 4. Execute the running process for one time unit
        if (runningProcess) {
            runningProcess.remainingBurst--;
            if (algorithm === 'round-robin') {
                 runningProcess.quantumLeft--;
            }

            // Extend the current Gantt block
            if (currentGanttBlock) {
                currentGanttBlock.end = currentTime + 1;
            }

            // Check for completion
            if (runningProcess.remainingBurst <= 0) {
                runningProcess.state = 'terminated';
                runningProcess.completion = currentTime + 1; // Finishes at the end of this time unit
                completedProcesses.push(runningProcess); // Add the simulation object copy
                // Gantt block end is already set to currentTime + 1, no need to finalize further
                runningProcess = null; // CPU becomes free
                currentGanttBlock = null;
            }
            // Check for RR quantum expiry (if not completed)
            else if (algorithm === 'round-robin' && runningProcess.quantumLeft <= 0) {
                runningProcess.state = 'ready';
                 // Gantt block end is already set to currentTime + 1
                readyQueue.push(runningProcess); // Add to END of ready queue for RR
                runningProcess = null; // CPU becomes free
                currentGanttBlock = null;
            }
        } else {
             // CPU is Idle - potentially add an idle block to Gantt chart (optional enhancement)
             // If needed, check if the last block was not idle and add an idle block from last end time to currentTime
        }

        // 5. Advance Time or Terminate Simulation
        // Check if simulation should end: all original processes are in the completed list
        if (completedProcesses.length === simulationProcesses.length) {
            simulationRunning = false; // All processes are completed
        } else if (!runningProcess && readyQueue.length === 0 && processPool.length > 0) {
            // CPU is idle, no processes ready, but processes are still waiting to arrive
            // Find the earliest arrival time among waiting processes
            let nextArrivalTime = Infinity;
            processPool.forEach(p => {
                if (p.arrival < nextArrivalTime) {
                    nextArrivalTime = p.arrival;
                }
            });

            // Jump time only if next arrival is strictly after current time
            if (nextArrivalTime > currentTime) {
                // Add idle time block to Gantt chart (optional)
                // let lastBlockEndTime = ganttChartData.length > 0 ? ganttChartData[ganttChartData.length - 1].end : 0;
                // if (currentTime > lastBlockEndTime) { ... add idle block ...}
                currentTime = nextArrivalTime;
            } else {
                 // Should not happen if pool has future arrivals > currentTime, but advance 1 as fallback
                 currentTime++;
            }
        } else if (!runningProcess && readyQueue.length === 0 && processPool.length === 0) {
             // CPU idle, ready queue empty, pool empty, but not all processes completed? Error state or finished.
             // This case should be caught by the completedProcesses.length check.
             // If it happens, break to prevent infinite loop if completion logic failed.
             console.warn("Simulation state: Idle, Ready Queue Empty, Pool Empty, but not all processes marked completed. Check completion logic.");
             simulationRunning = false;
        }
        else {
            // Normal time advance (CPU was busy or processes are ready/arriving next)
            currentTime++;
        }

        // Safety break (prevent infinite loops in case of unforeseen logic errors)
        if (currentTime > MAX_SIMULATION_TIME) {
            console.error(`Simulation safety break triggered (exceeded ${MAX_SIMULATION_TIME} time units).`);
            alert(`Simulation stopped after ${MAX_SIMULATION_TIME} time units to prevent potential infinite loop. Check process inputs or algorithm logic if this seems incorrect.`);
            simulationRunning = false;
        }

    } // End while loop

    // --- Post-Simulation Processing ---

    // Find the actual maximum completion time for chart scaling
    let lastCompletionTime = 0;
    completedProcesses.forEach(p => {
        if (p.completion !== null && p.completion > lastCompletionTime) {
            lastCompletionTime = p.completion;
        }
    });
    // Ensure lastCompletionTime is at least 1 for chart drawing if simulation was very short
     lastCompletionTime = Math.max(1, lastCompletionTime);
     // Also consider the highest start time + burst time as a potential maximum if something didn't finish
     processes.forEach(p => {
        lastCompletionTime = Math.max(lastCompletionTime, p.arrival + p.originalBurst);
     });


    // Update the original 'processes' array with the results from the completed simulation copies
    processes.forEach(p_orig => {
        const completedSimProcess = completedProcesses.find(cp => cp.id === p_orig.id);
        if (completedSimProcess) {
            p_orig.completion = completedSimProcess.completion;
            p_orig.startTime = completedSimProcess.startTime; // Copy start time as well

            // Calculate Turnaround and Waiting Time Here using original process arrival and ORIGINAL burst
            if (p_orig.completion !== null) {
                p_orig.turnaround = p_orig.completion - p_orig.arrival;
                // Waiting time = Turnaround Time - Actual Burst Time
                // Use originalBurst which was set from the input before simulation
                p_orig.waiting = Math.max(0, p_orig.turnaround - p_orig.originalBurst);
            } else {
                // Process did not complete (e.g., safety break)
                 p_orig.turnaround = null;
                 p_orig.waiting = null;
            }

        } else {
            // Process might not have completed if simulation hit safety break or other error
            console.warn(`Process ${p_orig.displayId} did not complete during simulation.`);
            p_orig.completion = null;
            p_orig.startTime = null;
            p_orig.turnaround = null;
            p_orig.waiting = null; // Indicate waiting time is unknown
        }
    });


    calculateAndDisplayResults();
    prepareGanttChart(lastCompletionTime);
    animateExecution(lastCompletionTime); // Start animation after calculations and chart prep
}


function sortReadyQueue(algorithm) {
    // Sorts the readyQueue (containing simulation process copies) in place
    // Should NOT be called for Round Robin
    if (algorithm === 'round-robin') return; // RR uses FIFO (no sort needed here)

    switch (algorithm) {
        case 'sjf':
             // Non-preemptive: Sort by ORIGINAL burst time, then arrival, then ID
             readyQueue.sort((a, b) => a.originalBurst - b.originalBurst || a.arrival - b.arrival || a.id - b.id);
             break;
        case 'srtf':
            // Preemptive: Sort by REMAINING burst time, then arrival, then ID
            readyQueue.sort((a, b) => a.remainingBurst - b.remainingBurst || a.arrival - b.arrival || a.id - b.id);
            break;
        case 'priority': // Non-preemptive Priority
        case 'preemptive-priority': // Preemptive Priority
            // Both sort by priority number (lower is higher priority), then arrival, then ID
            readyQueue.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival || a.id - b.id);
            break;
        case 'fcfs':
        default:
            // Sort by arrival time, then ID
            readyQueue.sort((a, b) => a.arrival - b.arrival || a.id - b.id);
            break;
    }
}

function calculateAndDisplayResults() {
    const resultsBody = document.querySelector("#resultsTable tbody");
    resultsBody.innerHTML = ""; // Clear previous results
    let totalTAT = 0, totalWT = 0;
    let numCompletedSuccessfully = 0; // Count processes with valid results
    const showPriority = document.getElementById("algo").value.includes("priority");

    // Use the main 'processes' array which now has updated completion/TAT/WT info
    // Sort by ID for consistent display order in the results table
    const displayOrderProcesses = [...processes].sort((a, b) => a.id - b.id);

    displayOrderProcesses.forEach(p => {
        let displayTAT = 'N/A', displayWT = 'N/A', displayComp = 'N/A';

        // Check if calculations resulted in valid numbers
        // Check specifically for null or non-finite numbers
        if (p.completion !== null && isFinite(p.completion)) {
             displayComp = p.completion;
             if (p.turnaround !== null && isFinite(p.turnaround)) {
                 displayTAT = p.turnaround;
                 totalTAT += p.turnaround;
                 if (p.waiting !== null && isFinite(p.waiting)) {
                     displayWT = p.waiting;
                     totalWT += p.waiting;
                     numCompletedSuccessfully++; // Increment only if all metrics are valid
                 } else {
                      console.warn(`Process ${p.displayId} has invalid Waiting Time.`);
                 }
             } else {
                 console.warn(`Process ${p.displayId} has invalid Turnaround Time.`);
             }
        } else {
             // If completion time is invalid, TAT/WT will also be invalid
             console.warn(`Process ${p.displayId} did not complete or has invalid Completion Time.`);
        }


        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${p.displayId}</td>
          <td>${p.arrival}</td>
          <td>${p.originalBurst}</td> <!-- Display original burst time from last reset/update -->
          <td class="priority-result-cell" style="display: ${showPriority ? 'table-cell' : 'none'};">${p.priority !== null ? p.priority : 'N/A'}</td>
          <td>${displayComp}</td>
          <td>${displayTAT}</td>
          <td>${displayWT}</td>
        `;
        resultsBody.appendChild(row);
    });

    // Calculate averages based on successfully completed processes with valid metrics
    const avgTAT = numCompletedSuccessfully > 0 ? (totalTAT / numCompletedSuccessfully).toFixed(2) : '0.00';
    const avgWT = numCompletedSuccessfully > 0 ? (totalWT / numCompletedSuccessfully).toFixed(2) : '0.00';

    document.getElementById("avgTAT").innerText = `Average Turnaround Time: ${avgTAT}`;
    document.getElementById("avgWT").innerText = `Average Waiting Time: ${avgWT}`;
}


// --- Visualization (prepareGanttChart, animateExecution, updateReadyQueueVisual) ---
function prepareGanttChart(maxTime) {
    const ganttChart = document.getElementById("ganttChart");
    const timeAxis = document.getElementById("timeAxis");
    ganttChart.innerHTML = '';
    timeAxis.innerHTML = '';

    // Ensure maxTime is sensible, default to 1 if calculation resulted in 0 or less
    let actualMaxTime = Math.max(1, maxTime);

    const chartWidth = actualMaxTime * GANTT_SCALE;
    ganttChart.style.width = `${chartWidth}px`;
    timeAxis.style.width = `${chartWidth}px`;

    let yOffset = 5; // Initial vertical offset for the first process track
    const trackHeight = 35; // Height allocated for each process track (bar + spacing)
    const barHeight = 30; // Actual height of the Gantt bar
    const processYMap = new Map(); // Map process ID to its Y coordinate

    // Assign Y coordinates to processes based on their first appearance in the Gantt chart
    ganttChartData.forEach(block => {
        if (!processYMap.has(block.processId)) {
            processYMap.set(block.processId, yOffset);
            yOffset += trackHeight; // Move down for the next unique process
        }
    });

    // Draw the Gantt bars
    ganttChartData.forEach(block => {
        // Ensure width is at least 1 pixel for visibility, even for 0-duration events if they existed
        const blockWidth = Math.max(1, (block.end - block.start) * GANTT_SCALE);
        const blockLeft = block.start * GANTT_SCALE;
        const blockY = processYMap.get(block.processId); // Get assigned Y coordinate

        // Find original process color (using the main 'processes' array for consistency)
        const originalProcess = processes.find(p => p.id === block.processId);
        const bgColor = originalProcess ? originalProcess.color : '#cccccc'; // Fallback color

        const bar = document.createElement('div');
        bar.className = 'gantt-bar';
        bar.id = block.id; // Use the unique block ID
        bar.style.left = `${blockLeft}px`;
        bar.style.width = `${blockWidth}px`;
        bar.style.top = `${blockY}px`;
        bar.style.height = `${barHeight}px`;
        bar.style.backgroundColor = bgColor;
        bar.innerText = block.displayId;
        bar.title = `${block.displayId} (Time ${block.start} to ${block.end})`; // Tooltip
        ganttChart.appendChild(bar);
    });

    // Set the total height of the chart area based on the number of process tracks
    ganttChart.style.height = `${Math.max(100, yOffset)}px`; // Minimum height of 100px
    // Adjust container height to fit chart and time axis
    document.getElementById('ganttChartContainer').style.height = `${Math.max(150, yOffset + 30)}px`; // yOffset + timeAxis height

    // Draw Time Axis Markers
    for (let t = 0; t <= actualMaxTime; t++) {
        const marker = document.createElement('div');
        marker.className = 'time-marker';
        marker.style.left = `${t * GANTT_SCALE}px`;

        // Add labels only at intervals to prevent clutter, especially for long charts
        let showLabel = true;
        if (actualMaxTime > 100 && t % 10 !== 0 && t !== actualMaxTime) showLabel = false;
        else if (actualMaxTime > 50 && t % 5 !== 0 && t !== actualMaxTime) showLabel = false;
        else if (actualMaxTime > 20 && t % 2 !== 0 && t !== actualMaxTime) showLabel = false;

        // Always show label for t=0 and the last time unit
        if (t === 0 || t === actualMaxTime) showLabel = true;

        marker.innerHTML = showLabel ? `<span>${t}</span>` : ``;
        timeAxis.appendChild(marker);
    }
}

function animateExecution(maxTime) {
    clearInterval(simulationInterval); // Clear any existing interval
    let animTime = 0;
    const timeIndicator = document.getElementById("timeIndicator");
    const execTimeDisplay = document.getElementById("executionTime");
    const cpuStatusDisplay = document.getElementById("cpuStatus");
    const queueContainer = document.getElementById("queueContainer");
    queueContainer.innerHTML = ''; // Clear visual queue initially

    // Use the maximum completion time calculated earlier
    let actualMaxTime = Math.max(1, maxTime);

    // --- Animation State ---
    // Use the main 'processes' array (which has updated completion times) for reference
    // Create a visual queue that holds process *objects* from the main 'processes' array
    let currentVisualQueue = [];

    simulationInterval = setInterval(() => {
        // --- Termination Condition ---
        if(animTime > actualMaxTime) {
            clearInterval(simulationInterval);
            simulationInterval = null;
            execTimeDisplay.innerText = `Current Time: ${actualMaxTime}`;
            cpuStatusDisplay.innerText = "CPU Status: Finished";
            // Final update to the visual queue (might be empty)
            updateReadyQueueVisual(currentVisualQueue);
            timeIndicator.style.left = `${actualMaxTime * GANTT_SCALE}px`;
             console.log("Animation Finished.");
            return;
        }

        // --- Update Time Display ---
        execTimeDisplay.innerText = `Current Time: ${animTime}`;
        timeIndicator.style.left = `${animTime * GANTT_SCALE}px`;

        let queueChanged = false; // Flag to track if visual queue needs redraw

        // --- Update Visual Queue Based on Events at `animTime` ---

        // 1. Processes Arriving Now
        processes.forEach(p => {
             if (p.arrival === animTime) {
                 // Check if it's not already visually present and not already completed before arrival (edge case)
                  const isInQueue = currentVisualQueue.some(vp => vp.id === p.id);
                  // Process state check isn't reliable here as 'processes' array state isn't updated live. Use completion time.
                  if (!isInQueue && (p.completion === null || p.completion > animTime)) {
                      console.log(`Time ${animTime}: Process ${p.displayId} arrived. Adding to visual queue.`);
                      currentVisualQueue.push(p);
                      queueChanged = true;
                 }
             }
         });

        // 2. Identify Processes Starting or Stopping Now
        let processStartingNow = null;
        let processesStoppingNow = [];
        ganttChartData.forEach(block => {
            if (block.start === animTime) {
                processStartingNow = processes.find(p => p.id === block.processId); // Get main process object
                 console.log(`Time ${animTime}: Gantt shows ${block.displayId} starting.`);
            }
            if (block.end === animTime) {
                const stoppedProcess = processes.find(p => p.id === block.processId);
                if (stoppedProcess) {
                    processesStoppingNow.push(stoppedProcess);
                     console.log(`Time ${animTime}: Gantt shows ${block.displayId} stopping.`);
                }
            }
        });

        // 3. Update CPU Status Display
        let currentGanttBlock = ganttChartData.find(g => animTime >= g.start && animTime < g.end);
        if (currentGanttBlock) {
            cpuStatusDisplay.innerText = `CPU Status: Running ${currentGanttBlock.displayId}`;
        } else {
             // Check if idle time started *exactly* now
             const endedLastTick = ganttChartData.some(g=> g.end === animTime);
             if (!processStartingNow && endedLastTick) {
                 // A process just finished/stopped, and nothing started immediately
                 cpuStatusDisplay.innerText = "CPU Status: Idle";
             } else if (!processStartingNow && !currentGanttBlock) {
                 // Still idle from previous tick(s)
                 cpuStatusDisplay.innerText = "CPU Status: Idle";
             }
             // If a process is starting now, the status will be updated when it runs next tick
        }


        // 4. Remove Starting Process from Visual Queue
        if (processStartingNow) {
            const indexInQueue = currentVisualQueue.findIndex(p => p.id === processStartingNow.id);
            if (indexInQueue > -1) {
                console.log(`Time ${animTime}: Process ${processStartingNow.displayId} started. Removing from visual queue.`);
                currentVisualQueue.splice(indexInQueue, 1);
                queueChanged = true;
            } else {
                 // This might happen if arrival and start are at the same time
                 console.log(`Time ${animTime}: Process ${processStartingNow.displayId} started (was not in visual queue).`);
            }
        }

        // 5. Add Stopping Processes Back to Visual Queue (If Not Completed)
        processesStoppingNow.forEach(stoppedProcess => {
            // Add back only if it's not completed at this time
            if (stoppedProcess.completion === null || stoppedProcess.completion > animTime) {
                // Also ensure it's not the one that just started (can happen if Q=0 or error)
                // And ensure it's not already back in the queue
                const isStartingAgain = processStartingNow && processStartingNow.id === stoppedProcess.id;
                const isInQueue = currentVisualQueue.some(vp => vp.id === stoppedProcess.id);

                if (!isStartingAgain && !isInQueue) {
                    console.log(`Time ${animTime}: Process ${stoppedProcess.displayId} stopped but not finished. Adding back to visual queue.`);
                    currentVisualQueue.push(stoppedProcess);
                    queueChanged = true;
                } else {
                    if(isStartingAgain) console.log(`Time ${animTime}: Process ${stoppedProcess.displayId} stopped but is immediately starting again.`);
                    if(isInQueue) console.log(`Time ${animTime}: Process ${stoppedProcess.displayId} stopped but was already in queue?`); // Should be rare
                }
            } else {
                 console.log(`Time ${animTime}: Process ${stoppedProcess.displayId} stopped and completed.`);
            }
        });


        // --- Update Visual Queue Display ---
        if (queueChanged) {
             console.log(`Time ${animTime}: Queue changed. Updating visual queue. Current state:`, JSON.stringify(currentVisualQueue.map(p=>p.displayId)));
            updateReadyQueueVisual(currentVisualQueue);
        }

        // --- Advance Animation Time ---
        animTime++;

    }, simulationSpeed); // Use simulationSpeed variable
}


function updateReadyQueueVisual(queue) {
    const queueContainer = document.getElementById("queueContainer");
    queueContainer.innerHTML = ''; // Clear current items

    // Sort visually for consistency (e.g., by ID or arrival time then ID)
    const displayQueue = [...queue].sort((a, b) => a.id - b.id); // Sort by ID

    console.log("updateReadyQueueVisual called with:", JSON.stringify(displayQueue.map(p => p.displayId))); // DEBUG LOG

    displayQueue.forEach(p => {
        // Ensure 'p' is a valid process object with expected properties
        if (p && p.displayId && p.color) {
            const item = document.createElement("div");
            item.className = "queue-item";
            item.id = `queue-item-${p.id}`;
            item.innerText = p.displayId;
            item.style.backgroundColor = p.color; // Use color from the process object
            item.title = `Process ${p.displayId} (Arrived: ${p.arrival}, Burst: ${p.originalBurst})`; // Tooltip
            queueContainer.appendChild(item);
        } else {
            console.warn("updateReadyQueueVisual: Invalid process object encountered in queue:", p);
        }
    });
}


// --- Utility ---

function getRandomColor() {
    let color = '#';
    let r, g, b;
    // Generate colors until a suitable brightness is found
    do {
        color = '#'; // Reset color string
        for (let i = 0; i < 6; i++) {
            color += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
        }
        // Check brightness (avoid very light/dark)
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
    } while (r + g + b > 650 || r + g + b < 150); // Adjusted range for better visibility

    return color;
}

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing.");
    updateInputFields(); // Set initial visibility of priority/quantum
    addSampleProcesses(); // Load default sample data
    // Add event listener for algorithm change to potentially clear results/viz? (Optional)
    // document.getElementById("algo").addEventListener("change", () => {
    //      resetSimulation(); // Or just clear results/viz?
    //      updateInputFields();
    // });
});


// --- END OF REVISED app.js ---