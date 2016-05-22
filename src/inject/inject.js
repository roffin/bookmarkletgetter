chrome.storage.local.get('syncServer', function (result) {
    if (!result.syncServer || result.syncServer.length == 0)
        return;

    var syncServers   = result.syncServer;
    var injectScripts = document.createElement('script');
    
    injectScripts.textContent = '';
    for (var i=0; i<syncServers.length; i++) {
        if (syncServers[i].injectScript)
            injectScripts.textContent += syncServers[i].injectScript + '\r\n';
    }

    document.documentElement.appendChild(injectScripts);
});