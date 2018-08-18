let RLP = require('rlp');

let { catchError, toHex } = require('../utilities.js');

// Wait for n blocks to pass
let mineNBlocks = async function(numBlocks, authority) {
    for (i = 0; i < numBlocks; i++) {
      await web3.eth.sendTransaction({from: authority, 'to': authority, value: 100});
    }
}

// Fast forward 1 week
let fastForward = async function() {
    let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;

    await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
    await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});

    let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
    let diff = (currTime - oldTime) - 804800;
    assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week");
}

// Create a generic deposit
let createAndDepositTX = async function(rootchain, address, amount) {
    let blockNum = (await rootchain.getDepositBlock.call()).toNumber();
    let txBytes = RLP.encode([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, address, amount, 0, 0, 0]);
    let validatorBlock = await rootchain.currentChildBlock.call();

    let tx = await rootchain.deposit(validatorBlock, toHex(txBytes), {from: address, value: amount});

    let blockHeader = (await rootchain.getChildChain.call(blockNum))[0];

    console.log(await calculatePriority(txBytes));

    return [tx, blockNum, txBytes];
};

// start a new exit
// checks that it succeeds
let startExit = async function(rootchain, sender, amount, minExitBond, blockNum, txPos, txBytes) {
  let exitSigs = Buffer.alloc(130).toString('hex');

  await rootchain.startExit(txPos, toHex(txBytes),
      toHex(proofForDepositBlock), toHex(exitSigs), {from: sender, value: minExitBond });

  let priority = 1000000000 * blockNum;
  let exit = await rootchain.getExit.call(priority);
  assert.equal(exit[0], sender, "Incorrect exit owner");
  assert.equal(exit[1], amount, "Incorrect amount");
  assert.equal(exit[2][0], blockNum, "Incorrect block number");
};

let calculatePriority = async function(txBytes) {
  let decodedBytes = await decodeTxBytes(txBytes)

  console.log(decodedBytes);

  let inputOnePriority
      = decodedBytes[3]
      + outputIndexFactor * decodedBytes[2]
      + txIndexFactor * decodedBytes[1]
      + blockNumFactor * decodedBytes[0];

  let inputTwoPriority
      = decodedBytes[7]
      + outputIndexFactor * decodedBytes[6]
      + txIndexFactor * decodedBytes[5]
      + blockNumFactor * decodedBytes[4];

  return Math.max(inputOnePriority, inputTwoPriority);
}

// Decodes the encoded transaction bytes which have the following form:
/// [Blknum1, TxIndex1, Oindex1, Amount1, depositNonce1
///  Blknum2, TxIndex2, Oindex2, Amount2, depositNonce1,
///  NewOwner, Denom1, NewOwner, Denom2, Fee]
let decodeTxBytes = async function(txBytes) {
  let decodedBytes = RLP.decode(txBytes);

  let result = []

  let i;
  for (i = 0; i < decodedBytes.length; i++) {
    let decodedValue;

    if (i === 10 || i === 12) {
      decodedValue = await bufferToHexString(decodedBytes[i]);
    }
    else {
      decodedValue = await bufferToInt(decodedBytes[i]);
    }

    result.push(decodedValue);
  }

  return result;
}

let bufferToHexString = async function(buffer) {
  let decodedValue = buffer.toString('hex');
  if (decodedValue == "") {
    decodedValue = "0";
  }

  return "0x" + decodedValue
}

let bufferToInt = async function(buffer) {
  let decodedValue = await bufferToHexString(buffer);
  decodedValue = parseInt(decodedValue, 16);

  return decodedValue
}

// 512 bytes
let proofForDepositBlock = '0000000000000000000000000000000000000000000000000000000000000000ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d3021ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a193440eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f839867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756afcefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf8923490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99cc1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8beccda7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2';

let zeroHashes = [ '0000000000000000000000000000000000000000000000000000000000000000',
  'ad3228b676f7d3cd4284a5443f17f1962b36e491b30a40b2405849e597ba5fb5',
  'b4c11951957c6f8f642c4af61cd6b24640fec6dc7fc607ee8206a99e92410d30',
  '21ddb9a356815c3fac1026b6dec5df3124afbadb485c9ba5a3e3398a04b7ba85',
  'e58769b32a1beaf1ea27375a44095a0d1fb664ce2dd358e7fcbfb78c26a19344',
  '0eb01ebfc9ed27500cd4dfc979272d1f0913cc9f66540d7e8005811109e1cf2d',
  '887c22bd8750d34016ac3c66b5ff102dacdd73f6b014e710b51e8022af9a1968',
  'ffd70157e48063fc33c97a050f7f640233bf646cc98d9524c6b92bcf3ab56f83',
  '9867cc5f7f196b93bae1e27e6320742445d290f2263827498b54fec539f756af',
  'cefad4e508c098b9a7e1d8feb19955fb02ba9675585078710969d3440f5054e0',
  'f9dc3e7fe016e050eff260334f18a5d4fe391d82092319f5964f2e2eb7c1c3a5',
  'f8b13a49e282f609c317a833fb8d976d11517c571d1221a265d25af778ecf892',
  '3490c6ceeb450aecdc82e28293031d10c7d73bf85e57bf041a97360aa2c5d99c',
  'c1df82d9c4b87413eae2ef048f94b4d3554cea73d92b0f7af96e0271c691e2bb',
  '5c67add7c6caf302256adedf7ab114da0acfe870d449a3a489f781d659e8becc',
  'da7bce9f4e8618b6bd2f4132ce798cdc7a60e7e1460a7299e3c6342a579626d2' ];

let outputIndexFactor = Math.pow(2, 64);
let txIndexFactor = Math.pow(2, 65);
let blockNumFactor = Math.pow(2, 81);

module.exports = {
    createAndDepositTX,
    fastForward,
    mineNBlocks,
    startExit,
    proofForDepositBlock,
    zeroHashes
};