// -----------
// Module Init
// -----------
//Barebones minimal node web server
// internal use only to:
// * show stats from the dia-adapter
// * respond with "pong" to watchdog's "ping"
// * accept shutdown command

//Dependencies
//------------
var path = require('path');
var fs = require('fs');
import * as  url from 'url';
import * as http from 'http';
import { FullAccessPermission } from './near-api/transaction';

//Module Vars
//-----------
//var
export const contentTypesByExtension = {
    '.html': "text/html; charset=utf-8"
    , '.css': "text/css; charset=utf-8"
    , '.js': "application/javascript; charset=utf-8"
    , '.jpg': "binary/image"
    , '.png': "binary/image"
    , '.gif': "binary/image"
    , '.ico': "binary/image"
};

type AppRequestHandlerFunction = (server: BareWebServer, urlParts: url.UrlWithParsedQuery, req: http.IncomingMessage, resp: http.ServerResponse)=>boolean

export class BareWebServer {

    httpServer: http.Server
    port: number
    wwwRoot: string
    appHandler: AppRequestHandlerFunction

    //    public function start( staticDir:string, aAppHandler:function, port)
    // ---------------------------
    //Start the web server
    constructor(staticDir: string, aAppHandler:AppRequestHandlerFunction, port: number) {

        this.wwwRoot = path.resolve(process.cwd(), staticDir);

        //default port = 80
        this.port = port || 80;

        //dynamyc content handler (application)
        this.appHandler = aAppHandler;

        //static files content handler
        this.httpServer = http.createServer(this.minimalHandler.bind(this));

    }

    start() {
        this.httpServer.listen(this.port);
        console.log("nodejs version: " + process.version + "\nBare Web Server listening on port " + this.port + "\nwwwRoot: " + this.wwwRoot);
    }

    //------------------------------
    // helper function MinimalHandler (request, response)
    //---------------------------
    //This is a minimal handler for http.createServer
    minimalHandler(req: http.IncomingMessage, resp: http.ServerResponse) {
        try {

            console.log('' + req.method + " " + req.url);

            //parse request url. [url.parse] (http://nodejs.org/docs/latest/api/url.html)
            var urlParts = url.parse(req.url||"", true);

            //We first give the app a chance to process the request (dynamic).
            if (this.appHandler && this.appHandler(this, urlParts, req, resp)) {
                //handled by app
                return;
            }

            else {
                this.respondWithFile(urlParts.pathname||"", resp);
            };

        }
        catch (e) {
            respond_error(503, e.message, resp);
        }
    }


    //## Bare Server Static resources Helper Functions

    //  helper function findPath(pathname) // return full path / undefined if not found
    // ---------------------------
    findPath(pathname:string):string {

        let result:string;
        //console.log("findPath %s",pathname);
        if (pathname === path.sep) {
            result = this.wwwRoot;
        }
        else {
            //result = path.join(wwwRoot, pathname)
            result = path.join(this.wwwRoot, pathname);
        };

        // check if file exists
        // if it is dir, -> add '/index.html'
        var fileExists = fs.existsSync(result);
        if (fileExists && fs.statSync(result).isDirectory()) {
            result = path.join(result, 'index.html');
            fileExists = fs.existsSync(result);
        };
        return fileExists? result : "";
    };

    // ---------------------------
    //method writeFileContents(filename)
    // ---------------------------
    writeFileContents(filename:string, resp:http.ServerResponse): boolean {

        const fullPath = this.findPath(filename)
        if (!fullPath){
            respond_error(404,filename+" NOT FOUND",resp)   
            return false;
        }
        // add headers
        //writeHeadersFor(path.extname(fullpath), resp);

        var file = fs.readFileSync(fullPath);
        //send read file
        resp.write(file);
        return true
    }

    // -------------------
    // method respondWithFile(file)
    // ---------------------------
    respondWithFile(file:string, resp:http.ServerResponse) {
        if (this.writeFileContents(file,resp)) {
            resp.end();
        }
        
    }

}


// ---------------------------
// method error(statusCode,message)
// ---------------------------
export function respond_error (statusCode:number, message:string, resp:http.ServerResponse) {
    resp.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    resp.write('ERROR: ' + message);
    resp.end();
};
