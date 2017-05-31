import ENS from 'ethereum-ens';
import Registrar from 'eth-registrar-ens';
import initCollections from './collections';
import Daefen from './daefen';

//These get assigned at init() below
export let ens;
export let registrar;
export let network;

export let errors = {
  invalidNetwork: new Error('Sorry, ENS is not available on this network at the moment.')
}

let networkId;

export default ethereum = (function() {
  let subscribers = [];
  let customEnsAddress;
  let ensAddress;
  let publishedAtBlock;

  function initWeb3() {
    return new Promise((resolve, reject) => {
      if(typeof web3 !== 'undefined') {
        web3 = new Web3(web3.currentProvider);
        LocalStore.set('hasNode', true);        
      } else {
        let Web3 = require('web3');
        // web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
        // web3 = new Web3(new Web3.providers.HttpProvider("https://ropsten.infura.io/NEefAs8cNxYfiJsYCQjc"));
        web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/NEefAs8cNxYfiJsYCQjc"));
        LocalStore.set('hasNode', false);

      }
      resolve();
    })
  }

  function checkConnection() {
    reportStatus(TAPi18n.__("reportStatus.checkingConnection"));
    let attempts = 4,
      checkInterval;

    return new Promise((resolve, reject) => {
      function check() {
        attempts--;
        if(web3.isConnected()) {
          clearInterval(checkInterval)
          resolve(web3);
        } else if (attempts <= 0) {
          console.log('checking..');
          reportStatus(TAPi18n.__("reportStatus.disconnected"));
        }
      }
      checkInterval = setInterval(check, 800);
      check();
    });
  }
  
  function checkNetwork() {
    return new Promise((resolve, reject) => {
      web3.eth.getBlock(0, function(e, res){
        if (e) {
          return reject(e)
        }
        console.log('checkNetwork', res.hash)
        networkId = res.hash.slice(2,8);
        switch(res.hash) {
          case '0x41941023680923e0fe4d74a34bdac8141f2540e3ae90623718e47d66d1ca4a2d':
            network='ropsten';
            ensAddress='0x112234455c3a32fd11230c42e7bccd4a84e02010';
            publishedAtBlock = 25409;
            resolve();
            break;
          case '0x0cd786a2425d16f152c658316c423e6ce1181e15c3295826d7c9904cba9ce303':
            network='morden';
            reject(errors.invalidNetwork);
            break;
          case '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3':
            network='main';
            ensAddress='0x314159265dd8dbb310642f98f50c066173c1259b';
            publishedAtBlock = 3605331;
            resolve();
            break;
          default:
            network='private';
            reject(errors.invalidNetwork);
        }
      });
    })
  }
  
  function initRegistrar() {
    reportStatus(TAPi18n.__("reportStatus.initializingENS"));
    return new Promise((resolve, reject) => {
      try {
        ens = new ENS(web3, customEnsAddress || ensAddress);
        registrar = new Registrar(web3, ens, 'eth', 7, (err, result) => {
          if (err) {
            return reject(err);
          }
          //TODO: Check that the registrar is correctly instanciated
          console.log('done initializing', err, result)
          resolve();
        });
      } catch(e) {
        reject('Error initialiting ENS registrar: ' + e);
      }
    });
  }

  function loadNames() {
    (function() {
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.src = 'preimages.js';
        var x = document.getElementsByTagName('script')[0];
        x.parentNode.insertBefore(s, x);
    })();
  }

  window.binarySearchNames = function(searchElement) {
    var minIndex = 0;
    var maxIndex = knownNames.length - 1;
    var currentIndex = (maxIndex + minIndex) / 2 | 0;
    var currentElement, currentElementSha3;

    if (searchElement.slice(0,2) == "0x" && web3.sha3('').slice(0,2) !== '0x') {
      searchElement = searchElement.slice(2);
    } else if (searchElement.slice(0,2) != "0x" && web3.sha3('').slice(0,2) == '0x') {
      searchElement = '0x' + searchElement;
    }

    while (minIndex <= maxIndex) {
      currentIndex = (minIndex + maxIndex) / 2 | 0;
      currentElement = knownNames[currentIndex];
      currentElementSha3 = web3.sha3(currentElement);

      if (currentElementSha3 < searchElement) {
        minIndex = currentIndex + 1;
      } else if (currentElementSha3 > searchElement) {
        maxIndex = currentIndex - 1;
      } else {
        return knownNames[currentIndex];
      }
    }

    return null;
  }

  window.watchEvents = function watchEvents() {

      web3.eth.getBlock('latest', (error, block) => {
        var STEP = 500; // blocks until now to look at
        var lastBlockLooked = localStorage.getItem('lastBlockLooked');
        var searchFromBlock = Math.max(lastBlockLooked, block.number - STEP);
        var namesCount;

        console.log(knownNames.length, ' known names loaded. Now checking for events since block ', searchFromBlock);
        
        return new Promise((resolve, reject) => {
          var AuctionStartedEvent = registrar.contract.AuctionStarted({}, {fromBlock: searchFromBlock});

          AuctionStartedEvent.watch(function(error, result) {
            if (!error) {            
                LocalStore.set('lastBlockLooked', result.blockNumber);
                var hash = result.args.hash.replace('0x','').slice(0,12);
                var nameObj = Names.findOne({hash: hash});
                var name, mode, binarySearchNamesResult;

                if (nameObj) {
                  name = nameObj.name;
                  mode = nameObj.mode;
                } else if((binarySearchNamesResult = binarySearchNames(result.args.hash)) !== null) {
                  name = binarySearchNamesResult;
                }
                
                if (name) {
                  Names.upsert({ name: name }, {
                    $set: {
                      fullname: name + '.eth',
                      registrationDate: Number(result.args.registrationDate.toFixed()),
                      hash: hash,
                      mode: mode || 'open',
                      public: true
                    }
                  });

                  // remove old names
                  var revealDeadline = Math.floor(new Date().getTime()/1000) + 48 * 60 * 60;
                  Names.remove({registrationDate: {$lt: revealDeadline}, watched: {$not: true}, mode: {$nin: ['not-yet-available', 'owned']}});

                  var unwatchedNames = _.pluck(Names.find({watched: {$not: true}, mode: {$nin: ['not-yet-available', 'owned']}}).fetch(),'name');

                  if (unwatchedNames.length > 2000) {
                    // if more than 2000 entries, remove 500 randomly
                    console.log('You have', unwatchedNames.length, 'names, removing some..')
                    Names.remove({name: {$in: _.sample(unwatchedNames, 500)}});
                    Names.remove({registrationDate: {$lt: revealDeadline}, watched: {$not: true}, mode: {$nin: ['not-yet-available', 'owned']}});
                  }

                }
            } 
          });

          var HashRegisteredEvent = registrar.contract.HashRegistered({}, {fromBlock: searchFromBlock});
          HashRegisteredEvent.watch(function(error, result) {
            if (!error) {
              LocalStore.set('lastBlockLooked', result.blockNumber);
              var value = Number(web3.fromWei(result.args.value.toFixed(), 'ether'));
              var hash = result.args.hash.replace('0x','').slice(0,12);
              var nameObj = Names.findOne({hash: hash});
              var name, mode, binarySearchNamesResult;

              if (nameObj) {
                name = nameObj.name;
                mode = nameObj.mode;
              } else if((binarySearchNamesResult = binarySearchNames(result.args.hash)) !== null) {
                name = binarySearchNamesResult;
              }
        
              if (name) { 
                Names.upsert({ hash: hash }, {
                    $set: {
                    name: name ? name : null,
                    fullname: name ? name + '.eth' : null,
                    registrationDate: Number(result.args.registrationDate.toFixed()),
                    value: value,
                    mode: mode || 'owned',
                    public: name && name.length > 0
                  }
                });
              }

              namesCount = Names.find({mode: 'owned', watched: {$not: true}}).count()
              if (namesCount > 100) {
                // if more than 100 entries, remove 50 older ones              
                console.log('Registered names db reached', namesCount, 'removing some excess names');
                var limit = Names.findOne({mode: 'owned', watched: {$not: true}}, {sort: {registrationDate: -1}, limit: 1, skip: 50});
                Names.remove({name:'', watched: {$not: true}});
                Names.remove({mode: 'owned', watched: {$not: true}, registrationDate: {$lt: limit.registrationDate }});
              } 
            } 
          }); 

          resolve(); 
        })
      })
  }
  function reportStatus(description, isReady, theresAnError) {
    subscribers.forEach((subscriber) => subscriber({
      isReady,
      description,
      theresAnError
    }));
  }
  
  function watchDisconnect() {
    function check() {
      if(web3.isConnected()) {
        setTimeout(check, 2500);
      } else {
        initEthereum();
      }
    }
    
    return new Promise((resolve, reject) => {
      check();
      resolve();
    })
  }
  
  function initEthereum() {
    reportStatus(TAPi18n.__("reportStatus.connecting"));
    
    return initWeb3()
      .then(checkConnection)
      .then(watchDisconnect)
      .then(checkNetwork)
      .catch(err => {
        if (err !== errors.invalidNetwork || !customEnsAddress) {
          throw err;
        }
      })
      .then(initRegistrar)
      .then(() => {
        //set a global for easier debugging on the console
        g = {ens, registrar, network};
        initCollections(networkId);
        loadNames();
        updateRevealNames();

        // add an interval to check on auctions every so ofter
        setInterval(updateRevealNames, 60000);
             
        if (LocalStore && !LocalStore.get('mastersalt')) {
          if (window.crypto && window.crypto.getRandomValues) {
            var random = window.crypto.getRandomValues(new Uint32Array(2)).join('')
          } else {
            var random = Math.floor(Math.random()*Math.pow(2,55)).toString();
          }
          LocalStore.set('mastersalt', Daefen(random));
         } 

        reportStatus(TAPi18n.__("reportStatus.ready"), true);
      })
      .catch(err => {
        console.error(err);
        reportStatus(err, false, true);
      })
  }


  function updateMistMenu() {

    if (typeof mist !== 'undefined' && mist && mist.menu) {
        var names = Names.find({mode: {$in: ['auction', 'reveal']}, watched: true}, {sort: {registrationDate: 1}}).fetch();
        mist.menu.clear();
        mist.menu.setBadge('');

        _.each(names, function(e,i){
            if (e.mode == 'auction') {
                var m =  moment(e.registrationDate * 1000 - 48*60*60*1000);
                var badge = m.fromNow(true);
            } else {
                if ( MyBids.find({name: e.name, revealed: { $not: true }}).count() > 0) {
                    var badge = 'Reveal now!';
                    mist.menu.setBadge('Some bids to expire soon');
                }
            }

            mist.menu.add(e._id, {
                name: e.fullname,
                badge: badge,
                position: i
            }, function(){
                // console.log('click menu', e);
                Session.set('searched', e.name);
            })
        })
    }  
  }

  function updateRevealNames() {
      var cutoutDate = Math.floor(Date.now()/1000) + 48*60*60;
      var now = Math.floor(Date.now()/1000);
      // keep updating 
      var names = Names.find({$or:[
          // any name I'm watching that is still on auction
          {registrationDate: {$gt: Math.floor(Date.now()/1000), $lt: cutoutDate}, name:{$gt: ''}, watched: true},
          // any name whose registration date has passed and isn't finalized
          {mode: {$nin: ['open', 'owned', 'forbidden']}, registrationDate: {$lt: now}, name:{$gt: ''}},
          // any name that is open or should be open by now
          {mode: {$in: ['open', 'not-yet-available']}, availableDate: {$lt: now}, name:{$gt: ''}}, 
          // any name that I don't know the mode
          {mode: {$exists: false}, name:{$gt: ''}}
          ]}, {limit:100}).fetch();

      console.log('update Reveal Names: ', _.pluck(names, 'name').join(', '));

      _.each(names, function(e, i) {
          registrar.getEntry(e.name, (err, entry) => {
          if(!err && entry) {
              Names.upsert({name: e.name}, {$set: {
                  mode: entry.mode, 
                  value: entry.mode == 'owned' ? Number(web3.fromWei(entry.deed.balance.toFixed(), 'ether')) : 0, 
                  highestBid: entry.highestBid,
                  registrationDate: entry.registrationDate
                }});            
          }})        
      })


      // Clean up Pending Bids
      _.each(PendingBids.find().fetch(), ( bid, i) => {  
        // check for duplicates 
        var dupBid = MyBids.find({shaBid:bid.shaBid}).fetch();
        if (dupBid && dupBid.shaBid == bid.shaBid && dupBid.secret == bid.secret){
            console.log('removing duplicate bid for', bid.name)
            PendingBids.remove({_id: bid._id});            
        } else {
          registrar.contract.sealedBids.call(bid.owner, bid.shaBid, (err, result) => {
            if (err) {
              console.log('Error looking for bid', bid.name, err);
            } else if (result !== '0x0000000000000000000000000000000000000000') {
              console.log('Insert bid', bid.name);
              //bid successfully submitted
              MyBids.insert(bid);
              PendingBids.remove({_id: bid._id});            
            } else {
              // Check for pending bids that are too late
              var name = Names.findOne({name: bid.name});
              var lastDay = Math.floor(new Date().getTime()) - (24 * 60 * 60 + 10 * 60) * 1000;      

              if (name && name.mode == 'owned') {
                console.log('Pending bid for', bid.name, 'has been removed because name is', name.mode);
                PendingBids.remove({_id: bid._id});          
              } else if (bid.date < lastDay) {
                console.log('A pending bid for', bid.name, 'is older than 24h and will be removed');
                PendingBids.remove({_id: bid._id});                          
              }
            }
          })        
        }
      })

      updateMistMenu();
  }  

  return {
    init: initEthereum,
    updateMistMenu,
    updateRevealNames,
    onStatusChange(callback) {
      subscribers.push(callback);
    },
    setCustomContract(ensAddress) {
      customEnsAddress = ensAddress;
    }
  };
}());


