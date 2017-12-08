var async = require('async');
var express = require('express');
var bodyParser = require('body-parser');
var r = require('rethinkdb');
var cors = require('cors')


var config = require(__dirname + '/config.js');

var app = express();
app.use(cors())
app.options('*', cors());




//For serving the index.html and all the other front-end assets.
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.json());


//The REST routes for "todos".
app.route('/todos')
        .get(listTodoItems)
        .post(createTodoItem);

app.route('/todos/:id')
        .get(getTodoItem)
        .put(updateTodoItem)
        .delete(deleteTodoItem);
app.route('/calculateListInTodos')
        .get(listcalculation)

//If we reach this middleware the route could not be handled and must be unknown.
app.use(handle404);

//Generic error handling middleware.
app.use(handleError);
//Access-Control-Allow-Origin
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Credentials", true);
    res.header("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
    next();
});

app.use(cors());
/*
 * Retrieve all todo items.
 */
function listcalculation(req, res, next) {
    r.table('todos').run(req.app._rdbConn, function (err, dataobtained) {
        dataobtained.toArray(function (err, result) {
            if (err) {
                return next(err)
            }
            res.json({length: result.length})
        })
    })
}
function listTodoItems(req, res, next) {
    r.table('todos').orderBy({index: 'createdAt'}).run(req.app._rdbConn, function (err, cursor) {
        if (err) {
            return next(err);
        }

        //Retrieve all the todos in an array.
        cursor.toArray(function (err, result) {
            if (err) {
                return next(err);
            }

            res.json(result);
        });
    });
}

/*
 * Insert a new todo item.
 */
function createTodoItem(req, res, next) {
    var todoItem = req.body;
    todoItem.createdAt = r.now();
    r.table('todos').insert(todoItem, {returnChanges: true}).run(req.app._rdbConn, function (err, result) {
        if (err) {
            return next(err);
        }
        console.log('in',result.changes[0].new_val,'id')
        res.json({result: result.changes[0].new_val});
    });
}

/*
 * Get a specific todo item.
 */
function getTodoItem(req, res, next) {
    var todoItemID = req.params.id;
    r.table('todos').get(todoItemID).run(req.app._rdbConn, function (err, result) {
        if (err) {
            return next(err);
        }

        res.json(result);
    });
}

/*
 * Update a todo item.
 */
function updateTodoItem(req, res, next) {
    var todoItem = req.body;
    var todoItemID = req.params.id;
    console.log(todoItemID)

    r.table('todos').get(todoItemID).update(todoItem, {returnChanges: true}).run(req.app._rdbConn, function (err, result) {
        if (err) {
            return next(err);
        }
        console.log(result.changes[0].new_val,'fine')
        res.json({result:result.changes[0].new_val});
    });
}
function updateOrder(req, res, next) {
    var todoItem = req.body;
    var todoItemID = req.params.id;
//    console.log(todoItemID)
//
//    r.table('todos').get(todoItemID).update(todoItem, {returnChanges: true}).run(req.app._rdbConn, function (err, result) {
//        if (err) {
//            return next(err);
//        }
//        console.log(result.changes[0].new_val,'fine')
//        res.json({result:result.changes[0].new_val});
//    });
}

/*
 * Delete a todo item.
 */
function deleteTodoItem(req, res, next) {
    var todoItemID = req.params.id;
    r.table('todos').get(todoItemID).delete().run(req.app._rdbConn, function (err, result) {
        if (err) {
            return next(err);
        }

        res.json({success: true});
    });
}
function socketload(req, res) {
    r.table('todos').changes().run(req, function (err, cursorData) {
        console.log("cursorData", 'socket is coming')
        if (err)
            throw err;
        var data = {
            wtsup_data: null,
            type: ''
        };
        cursorData.each(function (err, newvalue) {
            console.log("newvalue", newvalue)
            if (err)
                throw err;

            data.wtsup_data = newvalue
            data.type = 'wtsup_created'
            console.log("data.type", data.type)
            io.emit('wtsupdata', data)
//           
        });
    })
}

/*
 * Page-not-found middleware.
 */
function handle404(req, res, next) {
    res.status(404).end('not found');
}

/*
 * Generic error handling middleware.
 * Send back a 500 page and log the error to the console.
 */
function handleError(err, req, res, next) {
    console.error(err.stack);
    res.status(500).json({err: err.message});
}
global.http = require('http');
global.https = require('https');
var fs = require('fs');
var server = https.createServer({
    // key: fs.readFileSync(process.env.SSL_KEY),
    // cert: fs.readFileSync(process.env.SSL_CERT)
}, app);
/*
 * Store the db connection and start listening on a port.
 */
//var socket = glrequire('socket.io')
function startExpress(connection) {
    app._rdbConn = connection;
    global.io = require('socket.io').listen(server);
    app.listen(config.express.port);
    socketload(connection)
    console.log('listening on ', config.express.port)
}


/*
 * Connect to rethinkdb, create the needed tables/indexes and then start express.
 * Create tables/indexes then start express
 */
async.waterfall([
    function connect(callback) {
        r.connect(config.rethinkdb, callback);
    },
    function createDatabase(connection, callback) {
        //Create the database if needed.
        r.dbList().contains(config.rethinkdb.db).do(function (containsDb) {
            return r.branch(
                    containsDb,
                    {created: 0},
                    r.dbCreate(config.rethinkdb.db)
                    );
        }).run(connection, function (err) {
            callback(err, connection);
        });
    },
    function createTable(connection, callback) {
        //Create the table if needed.
        r.tableList().contains('todos').do(function (containsTable) {
            return r.branch(
                    containsTable,
                    {created: 0},
                    r.tableCreate('todos')
                    );
        }).run(connection, function (err) {
            callback(err, connection);
        });
    },
    function createIndex(connection, callback) {
        //Create the index if needed.
        r.table('todos').indexList().contains('createdAt').do(function (hasIndex) {
            return r.branch(
                    hasIndex,
                    {created: 0},
                    r.table('todos').indexCreate('createdAt')
                    );
        }).run(connection, function (err) {
            callback(err, connection);
        });
    },
    function waitForIndex(connection, callback) {
        //Wait for the index to be ready.
        r.table('todos').indexWait('createdAt').run(connection, function (err, result) {
            callback(err, connection);
        });
    }
], function (err, connection) {
    if (err) {
        console.error(err);
        process.exit(1);
        return;
    }

    startExpress(connection);
})
        ;

