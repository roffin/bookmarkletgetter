/*
 * CONSTANTS
 */

var SYNCHRONIZE_COOLDOWN_TIME = 30000;  // 30 seconds.
var PERIODIC_ALARM_TIME = 240;          // Every 4th hour.
var PERIODIC_SYNC_ALARM_NAME = 'sync_bookmarklets';

/*
 * INIT: Register synchronization triggers.
 */

// Sync on start.
var ranOnce = false;
window.addEventListener('load', function () {
    if (ranOnce)
        return;

    synchronize();
    ranOnce = true;
});

// Sync on click.
chrome.browserAction.onClicked.addListener(function (tab) {
    synchronize();
});

// Sync every 4th hour.
registerPeriodicSync();

/*
 * FUNCTIONS: Functions needed for synchronization.
 */

function synchronize() {
    if (!startSynchronizeCooldown())
        return;

    chrome.storage.local.get('syncServer', function (result) {
        if (!result.syncServer)
            return;
        
        var syncServers = result.syncServer;
        for (var i=0; i<syncServers.length; i++)
            syncScripts(syncServers[i].syncServer, syncServers[i].folderName);
    });
}

var synchronizeCooldownOngoing = false;
function startSynchronizeCooldown() {
    if (synchronizeCooldownOngoing)
        return false;

    synchronizeCooldownOngoing = true;
    setTimeout( function () {
        synchronizeCooldownOngoing = false;
    }, SYNCHRONIZE_COOLDOWN_TIME);

    return true;
}

function syncScripts(uri, folderName) {

    // Load config file from uri.
    var xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true);
    xhr.onreadystatechange = function () {
        if (!statusIsOk(xhr))
            return

        var config = JSON.parse(xhr.responseText);

        // Set user-specified folder name if given.
        config.folderName = folderName || config.folderName;

        // Check that folder name exists (either from file or options page).
        if (!config.folderName) {
            console.error('Folder name is missing.');
            return;
        }

        syncBookmarkletsAndBookmarks(config);
        syncInjectionScripts(uri, config);
    };
    
    try {
        xhr.send();
    }
    catch (exception) {
        console.error(exception);
    }
}

function syncBookmarkletsAndBookmarks(config) {
    chrome.bookmarks.getTree( function (tree) {
        var bookmarkTree   = tree[0];
        var uriBase        = config.uriBase;
        var scripts        = config.scripts;
        var folderName     = config.folderName;
        var bookmarksBarId = '1';

        if (!bookmarkFolderExists(folderName, bookmarkTree)) {
            chrome.bookmarks.create({
                'parentId': bookmarksBarId,
                'title'   : folderName
            });
        }

        chrome.bookmarks.getTree( function (tree) {
            tree = tree[0];

            var folderId = getFolderId(folderName, tree);
            var currentBookmarkletsIdMap = getCurrentBookmarkletsIdMap(tree, folderId);
            
            addAndUpdateBookmarkletsAndBookmarks(
                scripts,
                folderId,
                uriBase,
                currentBookmarkletsIdMap
            );

            removeBookmarkletsAndBookmarks(scripts, currentBookmarkletsIdMap);
        });
    });
}

function bookmarkFolderExists(folderName, bookmarkTree) {
    return getFolderId(folderName, bookmarkTree) != -1;
}

function getFolderId(folderName, bookmarkTree) {

    // Folder...
    if (bookmarkTree.children) {
        if (bookmarkTree.title == folderName)
            return bookmarkTree.id;
        
        for (var i = 0; i < bookmarkTree.children.length; i++) {
            var id = getFolderId(folderName, bookmarkTree.children[i]);
            if (id != -1)
                return id;
        }
    }

    // Bookmark...
    return -1;
}

function getCurrentBookmarkletsIdMap(tree, folderId) {
    var bookmarkletsTree = getSubTree(folderId, tree);
    var currentBookmarkletsIdMap = {};
    generateCurrentBookmarkletsIdMap(bookmarkletsTree, currentBookmarkletsIdMap);
    
    return currentBookmarkletsIdMap;
}

function getSubTree(id, tree) {
    // Folder...
    if (tree.children) {
        if (tree.id == id)
            return tree;
        
        for (var i = 0; i < tree.children.length; i++) {
            var subTree = getSubTree(id, tree.children[i]);
            if (subTree != -1)
                return subTree;
        }
    }

    // Bookmark...
    return -1;
}

function generateCurrentBookmarkletsIdMap(tree, bookmarkletsIdMap, base='') {
    if (tree.children && tree.children.length) {
        bookmarkletsIdMap[base + '/'] = tree.id;
        for (var i=0; i<tree.children.length; i++) {
            generateCurrentBookmarkletsIdMap(
                tree.children[i],
                bookmarkletsIdMap,
                base + '/' + tree.children[i].title
            );
        }
    } else if (tree.children) {
        bookmarkletsIdMap[base + '/'] = tree.id;
    } else {
        bookmarkletsIdMap[base] = tree.id;
    }
}

function addAndUpdateBookmarkletsAndBookmarks(scripts, parentId, uriBase, currentBookmarkletsIdMap, parentFolder='/') {
    var responseData = {};  // This is filled with data later in this function.

    var actuallyUpdateBookmarkletsAndBookmarks = function () {
        for (var i=0; i<scripts.length; i++) {
            var scriptObj = scripts[i];
            
            // Bookmarklet...
            if (scriptObj.scriptName && scriptObj.scriptFile) {
                handleBookmarklet(parentId, scriptObj.scriptName, responseData[i], i, uriBase, currentBookmarkletsIdMap, parentFolder);
            }

            // Bookmark...
            else if (scriptObj.bookmarkName && scriptObj.bookmarkAddress) {
                handleBookmark(parentId, scriptObj.bookmarkName, scriptObj.bookmarkAddress, i, currentBookmarkletsIdMap, parentFolder);
            }

            // Sub folder...
            else if (scriptObj.folderName && scriptObj.scripts) {
                handleSubFolder(parentId, scriptObj.folderName, scriptObj.scripts, i, uriBase, currentBookmarkletsIdMap, parentFolder);
            }
        }
    };

    // Find all bookmarklets (need HTTP request(s)).
    var requestUrls = getHttpRequestUrls(scripts);

    // Do HTTP requests.
    var expectedResponses = Object.keys(requestUrls).length;
    if (expectedResponses == 0) {
        actuallyUpdateBookmarkletsAndBookmarks();
        return;
    }

    for (i in requestUrls) {
        (function (i) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", uriBase + requestUrls[i], true);
            xhr.onreadystatechange = function () {

                if (statusIsOk(xhr)) {
                    responseData[i] = xhr.responseText;
                }
                else if (xhr.readyState == 4) {
                    expectedResponses--;
                }

                if (expectedResponses == Object.keys(responseData).length)
                    actuallyUpdateBookmarkletsAndBookmarks();
            };

            try {
                xhr.send();
            }
            catch (exception) {
                console.error(exception);
                expectedResponses--;

                if (expectedResponses == Object.keys(responseData).length)
                    actuallyUpdateBookmarkletsAndBookmarks();
            }
        })(i);
    }
}

function handleBookmarklet(parentId, scriptName, script, index, uriBase, currentBookmarkletsIdMap, parentFolder) {
    var bookmarkletExists = parentFolder+scriptName in currentBookmarkletsIdMap;
    if (bookmarkletExists) {
        chrome.bookmarks.update(
            currentBookmarkletsIdMap[parentFolder+scriptName],
            {
                url: 'javascript:' + script
            }
        );
        chrome.bookmarks.move(
            currentBookmarkletsIdMap[parentFolder+scriptName],
            {
                parentId: parentId,
                index: index
            }
        );
    } else {
        chrome.bookmarks.create({
            'parentId': parentId,
            'title'   : scriptName,
            'index'   : index,
            'url'     : 'javascript:' + script
        });
    }
}

function handleBookmark(parentId, bookmarkName, bookmarkAddress, index, currentBookmarkletsIdMap, parentFolder) {
    var bookmarkExists = parentFolder+bookmarkName in currentBookmarkletsIdMap;
    if (bookmarkExists) {
        chrome.bookmarks.update(
            currentBookmarkletsIdMap[parentFolder+bookmarkName],
            {
                url: bookmarkAddress
            }
        );
        chrome.bookmarks.move(
            currentBookmarkletsIdMap[parentFolder+bookmarkName],
            {
                parentId: parentId,
                index: index
            }
        );
    } else {
        chrome.bookmarks.create({
            'parentId': parentId,
            'title'   : bookmarkName,
            'url'     : bookmarkAddress,
            'index'   : index
        });
    }
}

function handleSubFolder(parentId, folderName, subFolderScripts, index, uriBase, currentBookmarkletsIdMap, parentFolder) {
    var folderExists = parentFolder+folderName+'/' in currentBookmarkletsIdMap;

    if (folderExists) {
        chrome.bookmarks.move(
            currentBookmarkletsIdMap[parentFolder+folderName+'/'],
            {
                parentId: parentId,
                index: index
            }
        );

        addAndUpdateBookmarkletsAndBookmarks(
            subFolderScripts,
            currentBookmarkletsIdMap[parentFolder+folderName+'/'],
            uriBase,
            currentBookmarkletsIdMap,
            parentFolder+folderName+'/'
        );
    } else {
        var onCreateDone = function (result) {
            addAndUpdateBookmarkletsAndBookmarks(
                subFolderScripts,
                result.id,
                uriBase,
                currentBookmarkletsIdMap,
                parentFolder+folderName+'/'
            );
        };
        chrome.bookmarks.create({
            'parentId': parentId,
            'title'   : folderName
        }, onCreateDone);
    }
}

function getHttpRequestUrls(scripts) {
    var requestUrls = {};

    for (var i=0; i<scripts.length; i++) {
        var scriptObj = scripts[i];
        if (scriptObj.scriptName && scriptObj.scriptFile)
            requestUrls[i] = scriptObj.scriptFile;
    }

    return requestUrls;
}

function removeBookmarkletsAndBookmarks(scripts, currentBookmarkletsIdMap) {
    var scriptsAsPathList = generateScriptPathList(scripts);
    var bookmarkPathsToRemove =
        createListOfBookmarkPathsToRemove(currentBookmarkletsIdMap, scriptsAsPathList).sort();
    var idsToRemove = convertPathListToIdList(bookmarkPathsToRemove, currentBookmarkletsIdMap);
    removeBookmarkIdsByPop(idsToRemove);
}

function generateScriptPathList(scripts, parentFolder='/') {
    var scriptList = parentFolder == '/' ? [parentFolder] : [];

    for (var index in scripts) {
        var scriptObj = scripts[index];
        if (scriptObj.scriptName && scriptObj.scriptFile) {
            scriptList.push(parentFolder + scriptObj.scriptName);
        }
        else if (scriptObj.bookmarkName && scriptObj.bookmarkAddress) {
            scriptList.push(parentFolder + scriptObj.bookmarkName);
        }
        else if (scriptObj.folderName && scriptObj.scripts) {
            scriptList.push(parentFolder + scriptObj.folderName + '/');
            scriptList = scriptList.concat(
                generateScriptPathList(
                    scriptObj.scripts,
                    parentFolder + scriptObj.folderName + '/'
                )
            );
        }
    }

    return scriptList;
}

function createListOfBookmarkPathsToRemove(bookmarkletsIdMap, scriptList) {
    var toRemove = [];
    for (scriptName in bookmarkletsIdMap) {
        if (scriptList.indexOf(scriptName) == -1)
            toRemove.push(scriptName);
    }
    return toRemove;
}

function convertPathListToIdList(bookmarkPaths, currentBookmarkletsIdMap) {
    var ids = [];
    for (index in bookmarkPaths)
        ids.push(currentBookmarkletsIdMap[bookmarkPaths[index]]);
    return ids;
}

function removeBookmarkIdsByPop(idsToRemove, currentBookmarkletsIdMap) {
    while (idsToRemove.length > 0) {
        var id = idsToRemove.pop();
        chrome.bookmarks.remove(id);
    }
}

function syncInjectionScripts(configUri, config) {
    if (!configUri)
        return;

    var injectScripts = [];
    var expectedArrayLength = config.injectScripts ? config.injectScripts.length : 0;

    if (expectedArrayLength == 0) {
        storeInjectScripts(configUri, injectScripts, expectedArrayLength);
        return;
    }

    for (var i=0; i<config.injectScripts.length; i++) {
        getInjectScript(config.uriBase + config.injectScripts[i], function (script) {
            injectScripts.push(script);
            storeInjectScripts(configUri, injectScripts, expectedArrayLength);
        }, function () {
            expectedArrayLength -= 1;
            storeInjectScripts(configUri, injectScripts, expectedArrayLength);
        });
    }
}

function getInjectScript(uri, successCallback, failCallback) {
    var xhr = new XMLHttpRequest();
        xhr.open("GET", uri, true);
        xhr.onreadystatechange = function () {
            if (statusIsOk(xhr)) {
                successCallback(xhr.responseText);
            }

            else if (xhr.readyState == 4) {
                failCallback();
            }
        };

        try {
            xhr.send();
        }
        catch (exception) {
            console.error(exception);
            failCallback();
        }
}

function storeInjectScripts(configUri, scripts, expectedLength) {
    if (scripts.length != expectedLength || !configUri)
        return;

    var injectScript = '';
    for (var i=0; i<scripts.length; i++) {
        injectScript += scripts[i] + '\r\n';
    }

    var job = function (next) {
        chrome.storage.local.get('syncServer', function (result) {
            if (!result.syncServer)
                return;
            for (var i=0; i<result.syncServer.length; i++) {
                if (result.syncServer[i].syncServer == configUri) {
                    result.syncServer[i].injectScript = injectScript;
                    chrome.storage.local.set({
                        syncServer: result.syncServer
                    }, function () {
                        next();
                    });
                    break;
                }
            }
        });
    };
    queueStoreJob(job);
}

var storeJobs = [];
var storeJobOngoing = false;
function queueStoreJob(job) {
    storeJobs.push(job);

    if (storeJobs.length == 1 && !storeJobOngoing) {
        storeJobOngoing = true;
        executeNextJob();
    }
}

function executeNextJob() {
    if (storeJobs.length == 0) {
        storeJobOngoing = false;
        return;
    }

    var job = storeJobs.shift();
    job(executeNextJob);
}

function registerPeriodicSync() {
    chrome.alarms.create(PERIODIC_SYNC_ALARM_NAME, {
        delayInMinutes: PERIODIC_ALARM_TIME,
        periodInMinutes: PERIODIC_ALARM_TIME
    });

    chrome.alarms.onAlarm.addListener(function (alarm) {
        if (alarm.name == PERIODIC_SYNC_ALARM_NAME)
            synchronize();
    });
}

function statusIsOk(xhr) {
    return xhr.readyState == 4 && Math.floor(xhr.status/100) == 2;
}
