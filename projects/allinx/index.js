const sdk = require("@defillama/sdk");
const abi = require('./abi.json')
const BigNumber = require("bignumber.js");
const { unwrapUniswapLPs } = require('../helper/unwrapLPs')

const vaults = [
  '0x95441f1FfF57fc8E7779eCf195FeB9c0D61d9d1b',
  '0xf6C5d5978dDB0D5313B2870fF818E960eFD704bC',
  '0xE745f2868119D1D48180dEDE516783BdEAF008Ab',
  '0x36F4AeCC8Fdcc9042f0E1B4F12C915D243E78DA1',
  '0x6819Ed584c9b3f0741411Cd386239bD4787EB73E',
  '0x65C5E366fA566A250418D0C60a380Cf6aDEA1858',
  '0xC7423D968F36a03497e4CaA9aea37793013c4c3c',
  '0x65C5E366fA566A250418D0C60a380Cf6aDEA1858',
  '0x6d48139976eA634944DE3Ab5a60437a67e32A525',
  '0xAfFBCB62341E2Ce6ade8087b0f845BB32ffa2D1b',
  '0x0D760F5CBe4f02AAEEc29cE9446bfAAd83F90c1a',
  '0xCba1958952d528d70CC8F92D8f9b1D823138944C',
]

const lpStakingPools = [
  '0x698ff49E49B6a80698e2Edb88710986d27157449',
  '0xFd3d011f7dE602183eBd9e46A7Ce9e59192dDA85',
  '0xF8864180D2baE3eC70A574e61baBB10fCca88b54',
  '0xbEd523101DBDe8B465c8343B4443Eb7fB37C1F48',
  '0x28ac283b299BbdDf5B27822fA7C243De835cc121'
]

const wbnbInx = '0x898c75e1F9B80AD167403a72717A7Edf2F2Aa28d'
const inx = 'bsc:0xd60D91EAE3E0F46098789fb593C06003253E5D0a'
const wbnb = 'bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'

function getCallsFromTargets(targets) {
  return targets.map(target => ({
    target
  }))
}

async function tvl(timestamp) {
  const { block } = await sdk.api.util.lookupBlock(timestamp, {
    chain: 'bsc'
  })
  const balances = {};

  const vaultCalls = getCallsFromTargets(vaults)
  const vaultBalances = sdk.api.abi.multiCall({
    abi: abi['balance'],
    calls: vaultCalls,
    block,
    chain: 'bsc'
  })
  const vaultTokens = (await sdk.api.abi.multiCall({
    abi: abi['token'],
    calls: vaultCalls,
    block,
    chain: 'bsc'
  })).output
  const vaultTokenSymbols = (await sdk.api.abi.multiCall({
    abi: "erc20:symbol",
    calls: vaultTokens.map(call => ({
      target: call.output
    })),
    block,
    chain: 'bsc'
  })).output;
  const resolvedVaultBalances = (await vaultBalances).output;

  const lpTokensToCheck = []
  for (let i = 0; i < resolvedVaultBalances.length; i++) {
    if (vaultTokenSymbols[i].output === "Cake-LP") {
      lpTokensToCheck.push({
        token: vaultTokens[i].output,
        balance: resolvedVaultBalances[i].output
      })
    } else {
      sdk.util.sumSingleBalance(balances, `bsc:${vaultTokens[i].output}`, resolvedVaultBalances[i].output)
    }
  }

  const lpTokens = sdk.api.abi.multiCall({
    abi: abi['_lpToken'],
    calls: getCallsFromTargets(lpStakingPools),
    block,
    chain: 'bsc'
  })
  const lpTokenBalances = (await sdk.api.abi.multiCall({
    abi: abi['totalSupply'],
    calls: getCallsFromTargets(lpStakingPools),
    block,
    chain: 'bsc'
  })).output
  const resolvedLpTokens = (await lpTokens).output;
  sdk.util.sumSingleBalance(balances, `bsc:${resolvedLpTokens.pop().output}`, resolvedVaultBalances.pop().output);
  await unwrapUniswapLPs(balances, resolvedLpTokens
    .map((call, i) => ({
      token: call.output,
      balance: lpTokenBalances[i].output
    }))
    .concat(lpTokensToCheck),
    block, 'bsc', addr => `bsc:${addr}`);

  // Convert inx to bnb
  const reservesInxBNB = (await sdk.api.abi.call({
    target: wbnbInx,
    abi: { "constant": true, "inputs": [], "name": "getReserves", "outputs": [{ "internalType": "uint112", "name": "_reserve0", "type": "uint112" }, { "internalType": "uint112", "name": "_reserve1", "type": "uint112" }, { "internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32" }], "payable": false, "stateMutability": "view", "type": "function" },
    block,
    chain: 'bsc'
  })).output;
  const inxAmount = balances[inx];
  delete balances[inx];
  sdk.util.sumSingleBalance(balances, wbnb, BigNumber(reservesInxBNB[0]).div(reservesInxBNB[1]).times(inxAmount).toFixed(0))
  return balances
}

module.exports = {
  name: 'Allinx',
  token: 'INX',
  category: 'yield',
  start: 0, // WRONG!
  tvl
}