# BookmarkletGetter
Get/download/sync/update bookmarklets from an HTTP server.

As a User, you will enter a URL pointing to a configuration file that can look something like this:
    
    {
    	"folderName": "My Bookmarklets",
    	"uriBase": "http://www.example.com/bookmarklets/",
    	"injectScripts": [
    		"global/injectScript.js",
    		"global/injectScript2.js"
    	],
    	"scripts": [
    		{
    			"scriptName": "test",
    			"scriptFile": "test.js"
    		},
    		{
    			"bookmarkName": "Bookmark1",
    			"bookmarkAddress": "http://www.example.com/"
    		},
    		{
    			"folderName": "Folder1",
    			"scripts": [
    				{
    					"scriptName": "Bookmarklet 1",
    					"scriptFile": "folder1/bookmarklet.js"
    				}
    			]
    		}
    	]
    }

This structure will then be downloaded to your browser when the extension performs the sync. The extension will try to sync when starting Chrome or when clicking the extension button.

The folder will be added to the Bookmark Bar, but can be moved.

## Versions
v1.2.0
- Added possibility to disable JavaScript injection.

v1.1.1
- Added cooldown time for synchronisation in order to fix a bug where bookmark(lets) were added multiple times.

v1.1.0:
- New icon
- Support for normal bookmarks
- Support for inject, this means that you can put commonly used functions in a separate file

v1.0.1:
- Fixed bug where sub folders and their scripts were not created correctly
