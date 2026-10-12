const defaultItems = [
  {
    id: 1,
    name: "Rice",
    unit: "kg",
    stock: 10,
    weekday: 5,
    weekend: 12,
    cost: 45
  },
  {
    id: 2,
    name: "Milk",
    unit: "litres",
    stock: 8,
    weekday: 6,
    weekend: 10,
    cost: 30
  },
  {
    id: 3,
    name: "Sugar",
    unit: "kg",
    stock: 30,
    weekday: 2,
    weekend: 3,
    cost: 42
  },
  {
    id: 4,
    name: "Tea",
    unit: "packets",
    stock: 20,
    weekday: 3,
    weekend: 6,
    cost: 80
  }
];

let items = structuredClone(defaultItems);

const SAFETY_BUFFER = 0.10;
const ALERT_DAYS = 3;

const $ = (id) => document.getElementById(id);

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);


// Calculate demand, stock duration and suggested order quantity.
function calculate(item) {
  const demand = Math.max(
    0,
    item.weekday * 5 + item.weekend * 2
  );

  const averageDaily = demand / 7;

  const daysLeft =
    averageDaily > 0
      ? item.stock / averageDaily
      : Infinity;

  const suggestedOrder = Math.max(
    0,
    Math.ceil(
      demand * (1 + SAFETY_BUFFER) - item.stock
    )
  );

  const fullCost = suggestedOrder * item.cost;

  // Higher scores mean greater urgency.
  // This is a rule-based demo, not an ML prediction.
  let urgency =
    daysLeft <= 1
      ? 100
      : daysLeft <= ALERT_DAYS
      ? 85
      : daysLeft <= 5
      ? 65
      : 35;

  urgency += Math.min(15, averageDaily * 1.5);

  return {
    demand,
    averageDaily,
    daysLeft,
    suggestedOrder,
    fullCost,
    urgency
  };
}


// Display inventory and allow the user to edit its values.
function renderTable() {
  const body = $("inventoryBody");

  body.innerHTML = "";

  items.forEach((item) => {
    const calc = calculate(item);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <div class="product-name">
          ${escapeHtml(item.name)} (${escapeHtml(item.unit)})
        </div>
        <div class="product-sub">Product ${item.id}</div>
      </td>

      <td>
        <input
          class="number-input"
          aria-label="${escapeHtml(item.name)} stock on hand"
          type="number"
          min="0"
          step="1"
          value="${item.stock}"
          data-id="${item.id}"
          data-field="stock"
        >
      </td>

      <td>
        <input
          class="number-input"
          aria-label="${escapeHtml(item.name)} weekday sales per day"
          type="number"
          min="0"
          step="1"
          value="${item.weekday}"
          data-id="${item.id}"
          data-field="weekday"
        >
      </td>

      <td>
        <input
          class="number-input"
          aria-label="${escapeHtml(item.name)} weekend sales per day"
          type="number"
          min="0"
          step="1"
          value="${item.weekend}"
          data-id="${item.id}"
          data-field="weekend"
        >
      </td>

      <td>
        <input
          class="number-input"
          aria-label="${escapeHtml(item.name)} unit cost"
          type="number"
          min="0"
          step="1"
          value="${item.cost}"
          data-id="${item.id}"
          data-field="cost"
        >
      </td>

      <td class="demand-cell">
        ${calc.demand} ${escapeHtml(item.unit)}
      </td>

      <td>
        <span class="stock-days ${
          calc.daysLeft <= ALERT_DAYS ? "urgent" : "ok"
        }">
          ${
            Number.isFinite(calc.daysLeft)
              ? calc.daysLeft.toFixed(1) + " days"
              : "No sales"
          }
        </span>
      </td>

      <td class="money">
        ${money(calc.fullCost)}
      </td>
    `;

    body.appendChild(tr);
  });

  body.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", handleEdit);
  });

  updateMetrics();
}


// Handle changes made to stock, sales or product cost.
function handleEdit(event) {
  const id = Number(event.target.dataset.id);
  const field = event.target.dataset.field;

  const value = Math.max(
    0,
    Number(event.target.value) || 0
  );

  const item = items.find((x) => x.id === id);

  if (!item) return;

  item[field] = value;

  renderTable();

  $("results").innerHTML = `
    <div class="results-empty">
      <div class="empty-icon">↻</div>
      <strong>Your inventory changed</strong>
      <p>
        Select “Optimize my order” again to update the
        recommendation using your new numbers.
      </p>
    </div>
  `;
}


// Update the summary cards.
function updateMetrics() {
  $("productCount").textContent = items.length;

  $("urgentCount").textContent = items.filter(
    (item) => calculate(item).daysLeft <= ALERT_DAYS
  ).length;

  const totalDemand = items.reduce(
    (sum, item) => sum + calculate(item).demand,
    0
  );

  $("demandTotal").innerHTML =
    `${totalDemand} <small>units</small>`;
}


// Create a purchase plan that stays within the budget.
function optimizeOrder() {
  const budget = Math.max(
    0,
    Number($("budgetInput").value) || 0
  );

  const plans = items.map((item) => {
    const calc = calculate(item);

    let priority =
      calc.daysLeft <= 1
        ? 3
        : calc.daysLeft <= ALERT_DAYS
        ? 2
        : calc.daysLeft <= 5
        ? 1
        : 0;

    return {
      ...item,
      ...calc,
      priority
    };
  });

  // Sort urgent products first.
  // When priorities match, higher urgency comes first.
  plans.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.urgency - a.urgency ||
      a.cost - b.cost
  );

  let remaining = budget;

  plans.forEach((plan) => {
    plan.orderQty = 0;

    if (plan.suggestedOrder <= 0 || plan.cost <= 0) {
      return;
    }

    // Calculate how many units are affordable.
    const affordableQty = Math.floor(
      remaining / plan.cost
    );

    plan.orderQty = Math.min(
      plan.suggestedOrder,
      affordableQty
    );

    remaining -= plan.orderQty * plan.cost;
  });

  // Restore the original inventory display order.
  plans.sort((a, b) => a.id - b.id);

  renderResults(plans, budget, remaining);
}


// Display the final purchase plan.
function renderResults(plans, budget, remaining) {
  const totalSpend = budget - remaining;

  const unmet = plans.filter(
    (p) => p.orderQty < p.suggestedOrder
  );

  const pct =
    budget > 0
      ? Math.min(100, (totalSpend / budget) * 100)
      : 0;

  let rows = "";

  plans.forEach((plan) => {
    const qtyMissing =
      plan.suggestedOrder - plan.orderQty;

    const priorityLabel =
      plan.daysLeft <= ALERT_DAYS
        ? "HIGH PRIORITY"
        : plan.daysLeft <= 5
        ? "MEDIUM PRIORITY"
        : "LOW PRIORITY";

    const priorityClass =
      plan.daysLeft <= ALERT_DAYS
        ? "priority-high"
        : plan.daysLeft <= 5
        ? "priority-medium"
        : "priority-low";

    const reason =
      plan.suggestedOrder === 0
        ? "Current stock covers estimated demand"
        : plan.daysLeft <= ALERT_DAYS
        ? `Only ${
            Number.isFinite(plan.daysLeft)
              ? plan.daysLeft.toFixed(1)
              : "many"
          } days of stock left`
        : plan.daysLeft <= 5
        ? "Review stock before next order"
        : "Lower immediate stockout risk";

    rows += `
      <div class="plan-row">

        <div>
          <div class="plan-product">
            ${escapeHtml(plan.name)}
          </div>

          <span class="priority-tag ${priorityClass}">
            ${priorityLabel}
          </span>

          <div class="plan-reason">
            ${reason}
          </div>
        </div>

        <div class="plan-qty">
          Suggested full order
          <strong>
            ${plan.suggestedOrder} ${escapeHtml(plan.unit)}
          </strong>
        </div>

        <div class="plan-qty">
          Within your budget
          <strong>
            ${plan.orderQty} ${escapeHtml(plan.unit)}
          </strong>
        </div>

        <div class="plan-cost">
          ${money(plan.orderQty * plan.cost)}

          <small>
            ${
              qtyMissing > 0
                ? `${qtyMissing} units still unfunded`
                : "Suggested quantity covered"
            }
          </small>
        </div>

      </div>
    `;
  });

  const warning = unmet.length
    ? `
      <div class="warning-box">
        <strong>Heads up:</strong>
        Your budget can't cover every suggested order.
        ${unmet.map((p) => escapeHtml(p.name)).join(", ")}
        still have some unfunded units. Consider increasing
        your budget or reviewing lower-priority purchases.
        Recommendations are estimates, not guarantees.
      </div>
    `
    : "";

  $("results").innerHTML = `
    <div class="result-header">
      <div>
        <h3>Your suggested purchase plan</h3>
        <p>
          Highest stockout risk is prioritized first.
          Quantities stay within your budget.
        </p>
      </div>

      <div class="budget-chip">
        ${money(totalSpend)} of ${money(budget)} used
      </div>
    </div>

    <div class="progress-track">
      <div
        class="progress-fill"
        style="width: ${pct}%"
      ></div>
    </div>

    <div class="plan-list">
      ${rows || "<p>No products found.</p>"}
    </div>

    <div class="plan-footer">
      <div>
        <span>Estimated order spend</span>
        <strong>${money(totalSpend)}</strong>
      </div>

      <div class="leftover">
        <span>Budget remaining</span>
        <strong>${money(remaining)}</strong>
      </div>
    </div>

    ${warning}
  `;

  $("results").scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}


// Escape special characters before inserting text into HTML.
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char])
  );
}


// Optimize button.
$("optimizeBtn").addEventListener(
  "click",
  optimizeOrder
);


// Reset button restores the demo data.
$("resetBtn").addEventListener("click", () => {
  items = structuredClone(defaultItems);

  $("budgetInput").value = 3000;

  renderTable();

  $("results").innerHTML = `
    <div class="results-empty">
      <div class="empty-icon">✦</div>
      <strong>Your purchase plan will appear here</strong>
      <p>
        Set your budget and select “Optimize my order”
        to see which products to prioritize.
      </p>
    </div>
  `;
});


// Display inventory as soon as the page loads.
renderTable();