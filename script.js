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
            const tvlData = await this.fetchTVLHistory(chain, metadata.lp_token_address);


            let tokenHolders = null;
            if (this.getChainForMoralis(chain)) {
                await this.updateLoadingText('Loading token holders...');
                tokenHolders = await this.fetchTokenHolders(chain, metadata.lp_token_address);
            }
            console.log(tokenHolders)

            this.displayResults(metadata, depositorsData, tvlData, chain);

        } catch (error) {
            console.error('Error analyzing pool:', error);
            this.showError(error);
        } finally {
            this.hideLoading();
        }
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

    displayResults(metadata, depositorsData, tvlData, chain) {
        this.displayPoolHeader(metadata, chain);
        this.displayTVLChart(tvlData);
        this.displayDepositorsData(depositorsData);
        document.getElementById('results').classList.remove('hidden');
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

        const deploymentDate = new Date(metadata.deployment_date);
        const poolAge = this.calculateAge(deploymentDate);

        document.getElementById('pool-age').textContent = poolAge;
        document.getElementById('deployment-date').textContent = deploymentDate.toLocaleDateString();

        const txElement = document.getElementById('deployment-tx');
        txElement.textContent = `${metadata.deployment_tx.substring(0, 10)}...`;
        txElement.href = this.getTxExplorerUrl(chain, metadata.deployment_tx);
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

    updateTable() {
        const tbody = document.querySelector('#depositors-table tbody');
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageData = this.filteredDepositors.slice(startIndex, endIndex);

        tbody.innerHTML = pageData.map(depositor => `
            <tr>
                <td><a href="#" onclick="navigator.clipboard.writeText('${depositor.user_address}')" title="Click to copy">${depositor.user_address}</a></td>
                <td>${depositor.net_liquidity_provided.toLocaleString()}</td>
                <td>${depositor.total_deposits.toLocaleString()}</td>
                <td>${depositor.total_withdrawals.toLocaleString()}</td>
                <td>${depositor.add_liquidity_events}</td>
                <td>${depositor.remove_liquidity_events}</td>
            </tr>
        `).join('');
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
    async fetchTokenHolders(chain, tokenAddress, limit = 100) {
        const moralisChain = this.getChainForMoralis(chain);

        if (!moralisChain) {
            console.log(`Chain ${chain} not supported by Moralis, skipping token holders`);
            return null;
        }

        const workerUrl = 'https://your-worker-name.your-subdomain.workers.dev';
        const url = `${workerUrl}/api/token-holders/${tokenAddress}?chain=${moralisChain}&limit=${limit}`;

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
        return data;
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

}

document.addEventListener('DOMContentLoaded', () => {
    new CurveGaugeDashboard();
});