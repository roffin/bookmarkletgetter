var injectScripts = [];
function getInjectScriptForSyncUri(uri) {
    for (var i=0; i<injectScripts.length; i++) {
        if (injectScripts[i].syncUri == uri && injectScripts[i].injectScript)
            return injectScripts[i].injectScript;
    }

    return '';
}

chrome.storage.local.get('syncServer', function (result) {
    if (!result.syncServer)
        return;

    for (var i=0; i<result.syncServer.length; i++) {
        injectScripts.push({
            syncUri:      result.syncServer[i].syncServer,
            injectScript: result.syncServer[i].injectScript
        });
        var syncServersDiv = document.getElementById('sync-servers');
        var folderName = result.syncServer[i].folderName;
        var syncServer = result.syncServer[i].syncServer;
        var allowJavaScriptInjection = result.syncServer[i].allowJavaScriptInjection;
        syncServersDiv.innerHTML = syncServersDiv.innerHTML + '<input type="text" placeholder="Folder name (optional)" class="sync-server-folder-name" value="' + (folderName ? folderName : '') + '" /><input type="text" placeholder="Config file URI" class="sync-server" value="' + (syncServer ? syncServer : '') + '"/> Allow JavaScript injection? <input type="checkbox" class="js-injection-checkbox" ' + (allowJavaScriptInjection ? 'checked' : '') + '/><br>';
    }
});

document.getElementById('save-button').addEventListener('click', function () {
    
    // Collect data.
    var folderNameElements = document.getElementsByClassName('sync-server-folder-name');
    var folderNames = [];

    for (var i=0; i < folderNameElements.length; i++) {
        folderNames.push(folderNameElements[i].value);
    }
    console.debug(folderNames);

    var syncServerElements = document.getElementsByClassName('sync-server');
    var syncServers = [];

    for (var i=0; i < syncServerElements.length; i++) {
        syncServers.push(syncServerElements[i].value);
    }
    console.debug(syncServers);

    var allowJavaScriptInjectionCheckboxes = document.getElementsByClassName('js-injection-checkbox');
    var allowJavaScriptInjectionValues = [];

    for (var i=0; i < allowJavaScriptInjectionCheckboxes.length; i++) {
        allowJavaScriptInjectionValues.push(allowJavaScriptInjectionCheckboxes[i].checked);
    }
    console.debug(allowJavaScriptInjectionValues);

    var syncServerObjs = [];
    for (var i=0; i < syncServers.length; i++) {
        if (syncServers[i]) {
            var obj = {
                syncServer:       syncServers[i],
                allowJavaScriptInjection: allowJavaScriptInjectionValues[i],
                injectScript:     getInjectScriptForSyncUri(syncServers[i])
            };
            if (folderNames[i]) {
                obj.folderName = folderNames[i];
            }
            syncServerObjs.push(obj);
        }
    }

    // Save data.
    if (syncServerObjs.length > 0) {
        chrome.storage.local.set({
            syncServer: syncServerObjs
        }, function() {
            alert('Options saved!');
        });
    } else {
        chrome.storage.local.remove('syncServer', function () {
            alert('Options saved!');
        });
    }
});

document.getElementById('add-row').addEventListener('click', function () {
    
    // Collect data.
    var folderNameElements = document.getElementsByClassName('sync-server-folder-name');
    var folderNames = [];
    for (var i=0; i < folderNameElements.length; i++) {
        folderNames.push(folderNameElements[i].value);
    }
    console.debug(folderNames);

    var syncServerElements = document.getElementsByClassName('sync-server');
    var syncServers = [];
    for (var i=0; i < syncServerElements.length; i++) {
        syncServers.push(syncServerElements[i].value);
    }
    console.debug(syncServers);

    var allowJavaScriptInjectionCheckboxes = document.getElementsByClassName('js-injection-checkbox');
    var allowJavaScriptInjectionValues = [];
    for (var i=0; i < allowJavaScriptInjectionCheckboxes.length; i++) {
        allowJavaScriptInjectionValues.push(allowJavaScriptInjectionCheckboxes[i].checked);
    }
    console.debug(allowJavaScriptInjectionValues);

    // Add field.
    var syncServersDiv = document.getElementById('sync-servers');
    syncServersDiv.innerHTML = syncServersDiv.innerHTML + '<input type="text" placeholder="Folder name (optional)" class="sync-server-folder-name" /><input type="text" placeholder="Config file URI" class="sync-server" /> Allow JavaScript injection? <input type="checkbox" class="js-injection-checkbox"/><br>';

    // Put data back.
    folderNameElements = document.getElementsByClassName('sync-server-folder-name');
    syncServerElements = document.getElementsByClassName('sync-server');
    allowJavaScriptInjectionCheckboxes = document.getElementsByClassName('js-injection-checkbox');

    for (var i=0; i < syncServers.length; i++) {
        syncServerElements[i].value = syncServers[i];
        folderNameElements[i].value = folderNames[i];
        allowJavaScriptInjectionCheckboxes[i].checked = allowJavaScriptInjectionValues[i];

    }

});