/*
 * CONSTANTS-ish
 */

var synchronizeCooldownTime = 30000;    // 30 seconds.


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


/*
 * FUNCTIONS: Functions needed for synchronization.
 */

function synchronize() {
    if (!startSynchronizeCooldown())
        return;

    clearInjectScripts();   // Remove this call in future version.

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
    }, synchronizeCooldownTime);

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
        if (folderName)
            config.folderName = folderName;

        // Check that folder name exists (either from file or options page).
        if (!config.folderName) {
            console.error('Folder name is missing.');
            return;
        }

        updateBookmarklets(config);
        updateInjectScripts(uri, config);
    };
    
    try {
        xhr.send();
    }
    catch (exception) {
        console.error(exception);
    }
}

function updateBookmarklets(config) {
    chrome.bookmarks.getTree( function (tree) {
        var bookmarkTree   = tree[0];
        var uriBase        = config.uriBase;
        var scripts        = config.scripts;
        var folderName     = config.folderName;
        var bookmarksBarId = '1';
        var folderId       = undefined;

        // Create folder if it doesn't exist.
        if (!bookmarkFolderExists(folderName, bookmarkTree)) {
            chrome.bookmarks.create({
                'parentId': bookmarksBarId,
                'title'   : folderName
            }, function (result) {
                folderId = result.id;
            });
        }

        chrome.bookmarks.getTree( function (tree) {
            tree = tree[0];

            if (!folderId)
                folderId = getFolderId(folderName, tree);

            // Remove old. Add new.
            removeBookmarksInFolderId(folderId, function () {
                addBookmarklets(scripts, folderId, uriBase);
            });
        });
    });
}

function removeBookmarksInFolderId(folderId, doAfter) {
    if (typeof(folderId) != 'string')
        return;

    chrome.bookmarks.getSubTree(folderId, function (nodes) {
        if (nodes.length != 1)
            return;
        
        var folderNode = nodes[0];
        if (folderNode.children && folderNode.children.length) {
            for (var i=0; i<folderNode.children.length; i++) {
                var node = folderNode.children[i];
                if (node.children) {
                    chrome.bookmarks.removeTree(node.id);
                } else {
                    chrome.bookmarks.remove(node.id);
                }
            }
        }
        doAfter();
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

function addBookmarklets(scripts, parentId, uriBase) {
    var responseData = {};  // This is filled with data later in this function.

    var actuallyAddBookmarklets = function () {
        for (var i=0; i<scripts.length; i++) {
            var scriptObj = scripts[i];
            
            // Bookmarklet...
            if (scriptObj.scriptName && scriptObj.scriptFile) {
                handleBookmarklet(parentId, scriptObj.scriptName, responseData[i], i, uriBase);
            }

            // Bookmark...
            else if (scriptObj.bookmarkName && scriptObj.bookmarkAddress) {
                handleBookmark(parentId, scriptObj.bookmarkName, scriptObj.bookmarkAddress, i);
            }

            // Sub folder...
            else if (scriptObj.folderName && scriptObj.scripts) {
                handleSubFolder(parentId, scriptObj.folderName, scriptObj.scripts, uriBase);
            }
        }
    };

    // Find all bookmarklets (need HTTP request(s)).
    var requestUrls = getHttpRequestUrls(scripts);

    // Do HTTP requests.
    var expectedResponses = Object.keys(requestUrls).length;
    if (expectedResponses == 0) {
        actuallyAddBookmarklets();
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
                    actuallyAddBookmarklets();
            };

            try {
                xhr.send();
            }
            catch (exception) {
                console.error(exception);
                expectedResponses--;

                if (expectedResponses == Object.keys(responseData).length)
                    actuallyAddBookmarklets();
            }
        })(i);
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

function handleBookmarklet(parentId, scriptName, script, index, uriBase) {
    chrome.bookmarks.create({
        'parentId': parentId,
        'title'   : scriptName,
        'index'   : index,
        'url'     : 'javascript:' + script
    });
}

function handleBookmark(parentId, bookmarkName, bookmarkAddress, index) {
    chrome.bookmarks.create({
        'parentId': parentId,
        'title'   : bookmarkName,
        'url'     : bookmarkAddress,
        'index'   : index
    });
}

function handleSubFolder(parentId, folderName, subFolderScripts, uriBase) {
    var onCreateDone = function (result) {
        addBookmarklets(subFolderScripts, result.id, uriBase);
    };
    chrome.bookmarks.create({
        'parentId': parentId,
        'title'   : folderName
    }, onCreateDone);
}

function updateInjectScripts(configUri, config) {
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

function statusIsOk(xhr) {
    return xhr.readyState == 4 && Math.floor(xhr.status/100) == 2;
}

/**
 * Depricated. Remove in future version...
 */
function clearInjectScripts() {
    chrome.storage.local.get('injectScriptsFolders', function (result) {
        if (result.injectScriptsFolders) {
            for (var i=0; i<result.injectScriptsFolders.length; i++) {
                removeInjectScriptsFolder(result.injectScriptsFolders[i]);
            }
            chrome.storage.local.remove('injectScriptsFolders');
        }
    });
}

/**
 * Depricated. Remove in future version...
 */
function removeInjectScriptsFolder(folderName) {
    chrome.storage.local.remove('injectScripts' + folderName);
}
