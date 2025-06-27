class CurveGaugeDashboard {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 25;
        this.allDepositors = [];
        this.filteredDepositors = [];
        this.selectedChain = 'ethereum';

        this.initializeEventListeners();
        this.initializeCustomSelect();
    }

    initializeEventListeners() {
        const analyzeBtn = document.getElementById('analyze-btn');
        const pageSize = document.getElementById('page-size');
        const searchInput = document.getElementById('search-input');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        analyzeBtn.addEventListener('click', this.analyzePool.bind(this));
        pageSize.addEventListener('change', this.handlePageSizeChange.bind(this));
        searchInput.addEventListener('input', this.handleSearch.bind(this));
        prevBtn.addEventListener('click', () => this.changePage(-1));
        nextBtn.addEventListener('click', () => this.changePage(1));
    }

    initializeCustomSelect() {
        const selectSelected = document.querySelector('.select-selected');
        const selectItems = document.querySelector('.select-items');

        selectSelected.addEventListener('click', () => {
            selectItems.classList.toggle('select-hide');
            selectSelected.classList.toggle('select-arrow-active');
        });

        selectItems.addEventListener('click', (e) => {
            const item = e.target.closest('div[data-value]');
            if (item) {
                const value = item.getAttribute('data-value');
                const img = item.querySelector('img').src;
                const text = item.querySelector('span').textContent;

                selectSelected.querySelector('img').src = img;
                selectSelected.querySelector('span').textContent = text;

                this.selectedChain = value;
                selectItems.classList.add('select-hide');
                selectSelected.classList.remove('select-arrow-active');
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select')) {
                selectItems.classList.add('select-hide');
                selectSelected.classList.remove('select-arrow-active');
            }
        });
    }

    getChainForMoralis(chain) {
        const chainMapping = {
            ethereum: 'eth',
            polygon: 'polygon',
            arbitrum: 'arbitrum',
            optimism: 'optimism',
            base: 'base',
            xdai: 'gnosis',
        };

        return chainMapping[chain] || null;
    }

    async analyzePool() {
        const address = document.getElementById('gauge-address').value.trim();
        const chain = this.selectedChain;

        if (!address) {
            alert('Please enter a gauge address');
            return;
        }

        this.showLoading();
        this.hideError();

        try {
            await this.updateLoadingText('Loading pool metadata...');
            const metadata = await this.fetchMetadata(chain, address);

            await this.updateLoadingText('Loading depositors data...');
            const depositorsData = await this.fetchDepositors(chain, metadata.lp_token_address);

            await this.updateLoadingText('Loading TVL history...');
            const tvlData = await this.fetchTVLHistory(chain, address);

            let tokenHoldersData = [];
            if (this.getChainForMoralis(chain)) {
                await this.updateLoadingText('Loading token holders...');
                for (let i = 0; i < metadata.coins.length; i++) {
                    const coin = metadata.coins[i];
                    try {
                        const tokenHolders = await this.fetchTokenHolders(chain, coin.address);
                        if (tokenHolders && tokenHolders.length > 0) {
                            tokenHoldersData.push({
                                symbol: coin.symbol,
                                address: coin.address,
                                holders: tokenHolders
                            });
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch holders for ${coin.symbol}:`, error);
                    }
                }
            }

            this.displayResults(metadata, depositorsData, tvlData, tokenHoldersData, chain);

        } catch (error) {
            console.error('Error analyzing pool:', error);
            this.showError(error);
        } finally {
            this.hideLoading();
        }
    }

    async fetchTokenHolders(chain, tokenAddress) {
        const moralisChain = this.getChainForMoralis(chain);

        if (!moralisChain) {
            console.log(`Chain ${chain} not supported by Moralis, skipping token holders`);
            return null;
        }

        const workerUrl = 'https://curve-gauge-api.benoitb.workers.dev';
        const url = `${workerUrl}/api/token-holders/${tokenAddress}?chain=${moralisChain}`;

        console.log('Fetching token holders from:', url);

        const response = await fetch(url);
        console.log('Token holders response status:', response.status);
        console.log('Cache status:', response.headers.get('X-Cache'));

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch token holders (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('Token holders response:', data);
        return data.result || data;
    }

    async fetchMetadata(chain, address) {
        const url = `https://prices.curve.finance/v1/pools/${chain}/${address}/metadata`;
        console.log('Fetching metadata from:', url);

        const response = await fetch(url);
        console.log('Metadata response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch metadata (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('Metadata response:', data);
        return data;
    }

    async fetchDepositors(chain, lpTokenAddress) {
        const url = `https://prices.curve.finance/v1/liquidity/${chain}/${lpTokenAddress}/depositors`;
        console.log('Fetching depositors from:', url);

        const response = await fetch(url);
        console.log('Depositors response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch depositors (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('Depositors response:', data);
        return data;
    }

    async fetchTVLHistory(chain, lpTokenAddress) {
        const endTime = Math.floor(Date.now() / 1000);
        const startTime = endTime - (30 * 24 * 60 * 60);

        const url = `https://prices.curve.finance/v1/snapshots/${chain}/${lpTokenAddress}/tvl?start=${startTime}&end=${endTime}&unit=day`;
        console.log('Fetching TVL from:', url);

        const response = await fetch(url);
        console.log('TVL response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch TVL history (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('TVL response:', data);
        return data;
    }

    displayResults(metadata, depositorsData, tvlData, tokenHoldersData, chain) {
        this.displayPoolHeader(metadata, chain);
        this.displayTVLChart(tvlData);
        this.displayDepositorsData(depositorsData);

        if (tokenHoldersData && tokenHoldersData.length > 0) {
            this.displayTokenHoldersCharts(tokenHoldersData);
        }

        document.getElementById('results').classList.remove('hidden');
    }

    displayTokenHoldersCharts(tokenHoldersData) {
        const section = document.getElementById('token-holders-section');
        const chartsContainer = document.getElementById('token-holders-charts');

        chartsContainer.innerHTML = '';

        tokenHoldersData.forEach((tokenData, index) => {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'token-chart-container';

            const title = document.createElement('h4');
            title.textContent = `${tokenData.symbol} Token Holders`;

            const canvasContainer = document.createElement('div');
            canvasContainer.className = 'chart-container';

            const canvas = document.createElement('canvas');
            canvas.id = `token-chart-${index}`;

            const legend = document.createElement('div');
            legend.className = 'token-chart-legend';
            legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: #dc3545;"></div>
                <span>Contracts</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #667eea;"></div>
                <span>EOAs</span>
            </div>
        `;

            canvasContainer.appendChild(canvas);
            chartContainer.appendChild(title);
            chartContainer.appendChild(canvasContainer);
            chartContainer.appendChild(legend);
            chartsContainer.appendChild(chartContainer);

            this.createTokenHolderChart(canvas, tokenData);
        });

        section.classList.remove('hidden');
    }

    createTokenHolderChart(canvas, tokenData) {
        const ctx = canvas.getContext('2d');

        const top10Holders = tokenData.holders.slice(0, 10);

        const labels = top10Holders.map((holder, i) => {
            const shortAddress = `${holder.owner_address.substring(0, 6)}...${holder.owner_address.slice(-4)}`;
            const label = holder.owner_address_label || shortAddress;
            const truncatedLabel = label.length > 8 ? label.substring(0, 8) + '...' : label;
            return `#${i + 1} ${truncatedLabel}`;
        });

        const percentages = top10Holders.map(holder => holder.percentage_relative_to_total_supply);

        const backgroundColors = top10Holders.map(holder =>
            holder.is_contract ? '#dc3545' : '#667eea'
        );

        const borderColors = top10Holders.map(holder =>
            holder.is_contract ? '#c82333' : '#5a6fd8'
        );

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Percentage of Total Supply',
                    data: percentages,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const holder = top10Holders[context[0].dataIndex];
                                return holder.owner_address_label || holder.owner_address;
                            },
                            label: function(context) {
                                const holder = top10Holders[context.dataIndex];
                                return [
                                    `Share: ${context.parsed.y.toFixed(2)}%`,
                                    `Type: ${holder.is_contract ? 'Contract' : 'EOA'}`,
                                    `Balance: ${holder.balance_formatted}`,
                                    `USD Value: $${parseFloat(holder.usd_value).toLocaleString()}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1) + '%';
                            }
                        }
                    }
                }
            }
        });
    }
    displayPoolHeader(metadata, chain) {
        document.getElementById('pool-name').textContent = metadata.name;

        const registryElement = document.getElementById('registry');
        const registryLink = document.createElement('a');
        registryLink.href = this.getAddressExplorerUrl(chain, metadata.registry);
        registryLink.target = '_blank';
        registryLink.textContent = metadata.registry;
        registryLink.style.color = 'white';
        registryLink.style.textDecoration = 'none';
        registryLink.addEventListener('mouseenter', () => registryLink.style.textDecoration = 'underline');
        registryLink.addEventListener('mouseleave', () => registryLink.style.textDecoration = 'none');

        registryElement.innerHTML = '';
        registryElement.appendChild(registryLink);
        registryElement.appendChild(document.createTextNode(` (${metadata.pool_type})`));

        const gaugesElement = document.getElementById('gauges');
        gaugesElement.innerHTML = '';

        if (metadata.gauges && metadata.gauges.length > 0) {
            metadata.gauges.forEach((gaugeAddress, index) => {
                if (index > 0) {
                    gaugesElement.appendChild(document.createTextNode(', '));
                }

                const gaugeLink = document.createElement('a');
                gaugeLink.href = this.getAddressExplorerUrl(chain, gaugeAddress);
                gaugeLink.target = '_blank';
                gaugeLink.textContent = `${gaugeAddress.substring(0, 6)}...${gaugeAddress.slice(-4)}`;
                gaugeLink.className = 'gauge-link';
                gaugeLink.title = `Full address: ${gaugeAddress}`;

                gaugesElement.appendChild(gaugeLink);
            });
        } else {
            gaugesElement.textContent = 'None';
            gaugesElement.style.color = 'rgba(255, 255, 255, 0.7)';
        }

        const deploymentDate = new Date(metadata.deployment_date);
        const poolAge = this.calculateAge(deploymentDate);

        document.getElementById('pool-age').textContent = poolAge;
        document.getElementById('deployment-date').textContent = deploymentDate.toLocaleDateString();

        const txElement = document.getElementById('deployment-tx');
        txElement.textContent = `${metadata.deployment_tx.substring(0, 10)}...`;
        txElement.href = this.getTxExplorerUrl(chain, metadata.deployment_tx);
    }

    updateTable() {
        const tbody = document.querySelector('#depositors-table tbody');
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageData = this.filteredDepositors.slice(startIndex, endIndex);
        const chain = this.selectedChain;

        tbody.innerHTML = pageData.map(depositor => `
        <tr>
            <td><a href="${this.getAddressExplorerUrl(chain, depositor.user_address)}" target="_blank" title="View on explorer">${depositor.user_address}</a></td>
            <td>${depositor.net_liquidity_provided.toLocaleString()}</td>
            <td>${depositor.total_deposits.toLocaleString()}</td>
            <td>${depositor.total_withdrawals.toLocaleString()}</td>
            <td>${depositor.add_liquidity_events}</td>
            <td>${depositor.remove_liquidity_events}</td>
        </tr>
    `).join('');
    }

    calculateAge(deploymentDate) {
        const now = new Date();
        const diffTime = Math.abs(now - deploymentDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 30) {
            return `${diffDays} days`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''}`;
        } else {
            const years = Math.floor(diffDays / 365);
            const remainingMonths = Math.floor((diffDays % 365) / 30);
            return `${years} year${years > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
        }
    }

    getAddressExplorerUrl(chain, address) {
        const explorers = {
            ethereum: 'https://etherscan.io/address/',
            polygon: 'https://polygonscan.com/address/',
            arbitrum: 'https://arbiscan.io/address/',
            optimism: 'https://optimistic.etherscan.io/address/',
            base: 'https://basescan.org/address/',
            fantom: 'https://explorer.fantom.network/address/',
            xdai: 'https://gnosisscan.io/address/',
            sonic: 'https://sonicscan.org/address/',
            hyperliquid: 'https://www.hyperscan.com/address/',
            fraxtal: 'https://fraxscan.com/address/',
        };

        return (explorers[chain] || 'https://etherscan.io/address/') + address;
    }

    getTxExplorerUrl(chain, txHash) {
        const explorers = {
            ethereum: 'https://etherscan.io/tx/',
            polygon: 'https://polygonscan.com/tx/',
            arbitrum: 'https://arbiscan.io/tx/',
            optimism: 'https://optimistic.etherscan.io/tx/',
            base: 'https://basescan.org/tx/',
            fantom: 'https://explorer.fantom.network/tx/',
            xdai: 'https://gnosisscan.io/tx/',
            sonic: 'https://sonicscan.org/tx/',
            hyperliquid: 'https://www.hyperscan.com/tx/',
            fraxtal: 'https://fraxscan.com/tx/',
        };

        return (explorers[chain] || 'https://etherscan.io/tx/') + txHash;
    }

    displayTVLChart(tvlData) {
        const ctx = document.getElementById('tvl-chart').getContext('2d');

        const labels = tvlData.data.map(item =>
            new Date(item.timestamp * 1000).toLocaleDateString()
        );

        const tvlValues = tvlData.data.map(item => item.tvl_usd);

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'TVL (USD)',
                    data: tvlValues,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        reverse: true
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'TVL: $' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    displayDepositorsData(depositorsData) {
        const sortedDepositors = [...depositorsData.depositors]
            .sort((a, b) => b.net_liquidity_provided - a.net_liquidity_provided);

        this.allDepositors = sortedDepositors;
        this.filteredDepositors = sortedDepositors;

        const totalDeposits = sortedDepositors.reduce((sum, d) => sum + d.add_liquidity_events, 0);
        const totalWithdrawals = sortedDepositors.reduce((sum, d) => sum + d.remove_liquidity_events, 0);

        document.getElementById('total-deposits').textContent = totalDeposits.toLocaleString();
        document.getElementById('total-withdrawals').textContent = totalWithdrawals.toLocaleString();

        this.displayDepositorsChart(sortedDepositors);
        this.displayDepositorsTable();
    }

    displayDepositorsChart(depositors) {
        const ctx = document.getElementById('depositors-chart').getContext('2d');

        const top10 = depositors.slice(0, 10);
        const totalLiquidity = depositors.reduce((sum, d) => sum + d.net_liquidity_provided, 0);

        const labels = top10.map((d, i) => `#${i + 1} ${d.user_address.substring(0, 8)}...`);
        const percentages = top10.map(d => (d.net_liquidity_provided / totalLiquidity * 100));

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Liquidity Share (%)',
                    data: percentages,
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: '#667eea',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1) + '%';
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Share: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    displayDepositorsTable() {
        this.currentPage = 1;
        this.updateTable();
        this.updatePagination();
    }


    updatePagination() {
        const totalPages = Math.ceil(this.filteredDepositors.length / this.pageSize);

        document.getElementById('page-info').textContent =
            `Page ${this.currentPage} of ${totalPages}`;

        document.getElementById('prev-page').disabled = this.currentPage <= 1;
        document.getElementById('next-page').disabled = this.currentPage >= totalPages;
    }

    changePage(direction) {
        const totalPages = Math.ceil(this.filteredDepositors.length / this.pageSize);
        const newPage = this.currentPage + direction;

        if (newPage >= 1 && newPage <= totalPages) {
            this.currentPage = newPage;
            this.updateTable();
            this.updatePagination();
        }
    }

    handlePageSizeChange() {
        this.pageSize = parseInt(document.getElementById('page-size').value);
        this.currentPage = 1;
        this.updateTable();
        this.updatePagination();
    }

    handleSearch() {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();

        if (searchTerm) {
            this.filteredDepositors = this.allDepositors.filter(depositor =>
                depositor.user_address.toLowerCase().includes(searchTerm)
            );
        } else {
            this.filteredDepositors = [...this.allDepositors];
        }

        this.currentPage = 1;
        this.updateTable();
        this.updatePagination();
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('results').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('analyze-btn').disabled = true;
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('analyze-btn').disabled = false;
    }

    showError(error) {
        document.getElementById('error-message').textContent = error.message;
        document.getElementById('error-details').textContent = error.stack || 'No additional details';
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('results').classList.add('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }

    async updateLoadingText(text) {
        document.getElementById('loading-text').textContent = text;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CurveGaugeDashboard();
});