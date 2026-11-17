let cashflowChart = null;

async function loadDashboard() {
  try {
    const res = await API.get('/api/dashboard');
    if (!res.success) return;

    const data = res.data;
    const { metrics, recent_invoices, recent_transactions, company } = data;

    // Update Company info in sidebar
    if (company && company.name) {
      const sbName = document.getElementById('sidebar-company-name');
      if (sbName) sbName.textContent = company.name;
    }

    // Update KPI Metrics
    document.getElementById('metric-income').textContent = formatRupiah(metrics.total_income);
    document.getElementById('metric-expense').textContent = formatRupiah(metrics.total_expense);
    
    const profitEl = document.getElementById('metric-net-profit');
    profitEl.textContent = formatRupiah(metrics.net_profit);
    const profitHint = document.getElementById('metric-net-profit-hint');
    if (metrics.net_profit >= 0) {
      profitEl.className = 'text-2xl font-bold text-slate-900 font-mono-val';
      profitHint.textContent = 'Surplus kas operasional positif';
      profitHint.className = 'text-xs text-emerald-600 mt-1 flex items-center gap-1';
    } else {
      profitEl.className = 'text-2xl font-bold text-rose-600 font-mono-val';
      profitHint.textContent = 'Defisit operasional kas';
      profitHint.className = 'text-xs text-rose-600 mt-1 flex items-center gap-1';
    }

    // Unpaid invoices
    document.getElementById('metric-unpaid-invoices').textContent = formatRupiah(metrics.unpaid_invoice_amount);
    document.getElementById('metric-unpaid-count').textContent = `${metrics.unpaid_invoice_count} tagihan menunggu pelunasan`;

    const badgeUnpaid = document.getElementById('badge-unpaid-invoices');
    if (metrics.unpaid_invoice_count > 0) {
      badgeUnpaid.textContent = metrics.unpaid_invoice_count;
      badgeUnpaid.classList.remove('hidden');
    } else {
      badgeUnpaid.classList.add('hidden');
    }

    // HR & Payroll Widget
    document.getElementById('dash-active-employees').textContent = `${metrics.active_employee_count} Orang`;
    document.getElementById('dash-payroll-estimate').textContent = formatRupiah(metrics.monthly_salary_estimate);

    // Asset Badge
    const badgeAssets = document.getElementById('badge-asset-count');
    if (badgeAssets && metrics.total_assets_count !== undefined) {
      badgeAssets.textContent = metrics.total_assets_count;
    }

    // Render Recent Invoices
    renderRecentInvoices(recent_invoices);

    // Render Recent Transactions
    renderRecentTransactions(recent_transactions);

    // Render Chart
    renderCashflowChart(metrics.total_income, metrics.total_expense, metrics.net_profit);

  } catch (err) {
    showToast('Gagal memuat ringkasan dashboard: ' + err.message, 'error');
  }
}

function renderRecentInvoices(invoices = []) {
  const container = document.getElementById('dash-recent-invoices');
  if (!invoices.length) {
    container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Belum ada faktur yang diterbitkan</div>';
    return;
  }

  container.innerHTML = invoices.map(inv => {
    let statusClass = 'bg-slate-100 text-slate-700';
    if (inv.status === 'Lunas') statusClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    else if (inv.status === 'Terkirim') statusClass = 'bg-blue-50 text-blue-700 border border-blue-200';
    else if (inv.status === 'Jatuh Tempo') statusClass = 'bg-rose-50 text-rose-700 border border-rose-200';

    return `
      <div class="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-xs">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <i class="fa-solid fa-file-invoice"></i>
          </div>
          <div>
            <div class="font-bold text-slate-800">${escapeHtml(inv.client.name)}</div>
            <div class="text-[11px] text-slate-500 font-mono">${inv.invoice_number} &bull; ${formatDate(inv.date)}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-bold text-slate-900 font-mono">${formatRupiah(inv.grand_total)}</div>
          <span class="inline-block px-2 py-0.5 text-[10px] rounded-full font-semibold mt-0.5 ${statusClass}">
            ${inv.status}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function renderRecentTransactions(transactions = []) {
  const container = document.getElementById('dash-recent-transactions');
  if (!transactions.length) {
    container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Belum ada transaksi dicatat</div>';
    return;
  }

  container.innerHTML = transactions.map(t => {
    const isIncome = t.type === 'Pemasukan';
    const sign = isIncome ? '+' : '-';
    const amountClass = isIncome ? 'text-emerald-600' : 'text-rose-600';
    const iconClass = isIncome ? 'fa-arrow-down-left bg-emerald-50 text-emerald-600' : 'fa-arrow-up-right bg-rose-50 text-rose-600';

    return `
      <div class="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-xs">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg ${iconClass} flex items-center justify-center">
            <i class="fa-solid ${isIncome ? 'fa-arrow-down-left' : 'fa-arrow-up-right'}"></i>
          </div>
          <div>
            <div class="font-semibold text-slate-800 line-clamp-1">${escapeHtml(t.description)}</div>
            <div class="text-[11px] text-slate-400 font-medium">${t.category} &bull; ${formatDate(t.date)}</div>
          </div>
        </div>
        <div class="text-right font-mono font-bold ${amountClass}">
          ${sign} ${formatRupiah(t.amount)}
        </div>
      </div>
    `;
  }).join('');
}

function renderCashflowChart(income, expense, profit) {
  const ctx = document.getElementById('chart-cashflow');
  if (!ctx) return;

  if (cashflowChart) {
    cashflowChart.destroy();
  }

  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Pemasukan Kas', 'Pengeluaran Beban', 'Laba Bersih'],
      datasets: [{
        label: 'Jumlah (Rp)',
        data: [income, expense, Math.max(0, profit)],
        backgroundColor: [
          'rgba(16, 185, 129, 0.85)',
          'rgba(244, 63, 94, 0.85)',
          'rgba(59, 130, 246, 0.85)'
        ],
        borderColor: [
          '#10b981',
          '#f43f5e',
          '#3b82f6'
        ],
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' ' + formatRupiah(context.raw);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              if (value >= 1000000) return 'Rp ' + (value / 1000000) + ' Jt';
              return 'Rp ' + value;
            },
            font: { size: 10 }
          },
          grid: { color: '#f1f5f9' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: '600' } }
        }
      }
    }
  });
}
