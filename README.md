# oplog-db

This is a simple operations log reader/writer.

The idea is that your application has a number of JavaScript objects
that you mutate over time in the form of "operations".

For object persistence, this package writes the operations to a local
append-only file.

On startup, the operations are parsed and replayed to recreate the
same local database.

Appending to the log file is very fast, 10000 operations per second or so
on an old Macbook Pro.

Reading the oplog on startup is also fast but is dependent on the number
and size of the operations.

You can always snapshot the data to a single JSON file but for larger
amounts of data, this causes a large amount of memory to be used.

You are relegated to a single process for access or need some other
form of locking should you need to access the log from multiple processes.

Your data must be JSON-encodable.

All objects are bucketed into collections.  Each object must have a unique `id`
within that collection.
