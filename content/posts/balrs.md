---
title: "Building a simple Load Balancer in Rust" 
date: "2024-08-10"
tags: [Rust, load-balancing, networking]
description: "Blog writeup for the Bal.rs project"
author_name: Pranav V Bhat
author_link: "https://github.com/Prana-vvb"
collections: ["blog"]
---

## Why do I need a Load Balancer?

Let's say you have a few servers and are hosting a website. Great! Soon your website becomes popular and gets a lot of visitors daily. All well and good until your servers start to become overwhelmed with requests and die.
How to fix this? By putting a Load Balancer in between the clients and your servers.

A Load Balancer distributes incoming network traffic and distributes them across multiple servers to ensure no single server is overwhelmed thus optimizing reliability and resource utilization.

![A round robin load balancer](https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExcnc4MmNkNGkzbDZ6ZG1icW44aG9xZGg2NjNwZmdrbG1xeWNxMmZmZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/JAC4be8Wr01Lp8dyop/giphy.gif)

A Load Balancer can be physical or a software. It can be further classified base on which layer of the [OSI model](https://en.wikipedia.org/wiki/OSI_model) they operate at.

As part of the [Tilde 3.0 Summer mentorship program](https://homebrew.hsp-ec.xyz/posts/history/#Tilde), the [Bal.rs](https://github.com/homebrew-ec-foss/bal.rs) (Pronounced: `/ˈbɔːləz/`) team have built a simple L7 Load Balancer in Rust. Rust was chosen due to it's performance and safety while provding low level control over the system.<hr/>

## Getting started with Bal.rs

### Prerequisites

- [**Rust compiler**](https://doc.rust-lang.org/book/ch01-01-installation.html)
- [**Cargo package manager**](https://doc.rust-lang.org/book/ch01-01-installation.html)

### Building the Application Locally

Clone the [repository](https://github.com/homebrew-ec-foss/bal.rs) and build the application using `cargo`.

```sh
git clone https://github.com/homebrew-ec-foss/bal.rs
cd bal.rs
cargo build
```

For a production-ready build, you can use:

```sh
cargo build --release
```
<hr/>

### Using the Application

After building, the main executable will be located in `/target/debug` or `/target/release` based on the build command used.
Navigate to the directory and type

```sh
Balrs help start
```

in the terminal to get a list of available commands.

Alternatively, from the root directory of Bal.rs, you can use:

```sh
cargo run help start
```

for the same result.

While you can configure the Load Balancer using the command line interface, more configuration options are available through the `config.yaml` file and multiple different config files can be created.  
This feature enables the use of various configuration profiles without altering the original configuration. The desired profile can be specified through the CLI.<hr/>

## Technical Details

> This section covers only the `lb.rs` file which contains the actual Load Balancing logic.

There are 3 key components of our Load Balancer:
- **Listener**: Listens for incoming HTTP requests.
- **Routing**: Does the actual load balancing by forwarding the client request to the servers.
- **Fault Tolerence**: Makes sure the Load Balancer handles any faults gracefully.

### Listener

We have used Rust's [`tokio`](https://tokio.rs) crate to handle asynchronous processing and the [`hyper`](https://hyper.rs) crate for networking. Tokio's `TcpListener` is used to listen for incoming connections

![Listener code snippet](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/aaad34c5cb5e8a09b7d0f83004e3f40298f368ef/Listener.svg)

In this code snippet, we create a `TcpListener` instance to listen for incoming traffic and set it to listen on the address of the Load Balancer.  
If the listener is bound to the Load Balancer successfully, we return the listener object for passing incoming requests to the `handle_request` function or else the error encountered is displayed.<hr/>

### Routing the Connections

There are 3 functions dealing with client requests.

1. Handling incoming requests: `handle_request` function

   ![Handling an incoming request](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/aaad34c5cb5e8a09b7d0f83004e3f40298f368ef/Handle.svg)

   We lock the `LoadBalancer` instance to access the server list and filter out any dead servers.  
   The function then tries to pass the request to the `get_request` function. If this fails, a message is logged and the loop restarts.
   If there are no available servers, a HTTP 500 response is returned.
   
   This is a dynamic fault tolerence system that reroutes an incoming request to a different server if one server is not available.

   ![Flowchart of the fault tolerence system](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/aaad34c5cb5e8a09b7d0f83004e3f40298f368ef/FaultFlow.svg)

2. Forwarding requests to server: `get_request` function
   ![get_request snippet 1](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/aaad34c5cb5e8a09b7d0f83004e3f40298f368ef/Get1.svg)

   Gets indexes of the servers and selects the server to be used according to the specified algorithm.

   ![get_request snippet 2](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/aaad34c5cb5e8a09b7d0f83004e3f40298f368ef/Get2.svg)

   Here, the server URL is constructed. Requests are then forwarded to the server using the `send_request` function.
   Along with that, a timer is started to measure server response time. The server response is stored in the `data` variable.

   ![get_request snippet 3](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/aaad34c5cb5e8a09b7d0f83004e3f40298f368ef/Get3.svg)

   Here, we handle variants of the server response. If we get a successful response, we return the response data or else mark the corresponding server as dead and return `None`.

3. Retrieve server response: `send_request` function

   ![send_request snippet 1](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/41da9994330f1f96dd34a774291e3cab7af0616a/Send1.svg)

   Parse the URL from the request and extract host and port from it. The port defaults to 80 if not specified.
   Then format the address to a string for a TCP connection.

   ![send_request snippet 2](https://gist.githubusercontent.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/8c6f46419c58e90d5e7d1ef529dffb1290a2dec1/Send2.svg)

   Establish a TCP connection to the formatted address and wrap it in a tokio IO adapter so that it can be used with `hyper`.  
   A `hyper` client is then initialised using a HTTP/1 handshake.

   ![send_request snippet 3](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/83eb442c500db2d84dd55ea8e7dfebf7655d24e6/Send3.svg)

   The HTTP request is prepared with the given URL and `HOST` header and sent using the `hyper` client.

   ![send_request snippet 4](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/b8f7b4fd97ad58e8bcb4492d78537c501417c635/Send4.svg)
   
   The server response body is then collected in chunks and appended to `full_body`. The complete response is then converted to `Bytes` and returned.<hr/>

### Fault Tolerence
This is a slightly large piece of code that ensures smooth functioning of the Load Balancer. So, let's break it down.

   ![Fault tolerence snippet 1](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/b8f7b4fd97ad58e8bcb4492d78537c501417c635/Health1.svg)
   
   Here, we create variables to store the required configuration values and clone a `LoadBalancer` instance for further use.

   ![Fault tolerence snippet 2](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/7a6c8a958bf3039f7d5b106a4a195339accea118/Health2.svg)

   Spawn an asynchronous tokio task for the health checker and create a vector to hold other tokio tasks.  
   Each task corresponds to the health check for each server. This is done to ensure all health checks happen simultaneously.
   We create the required number of tasks using a for loop where `len` is the number of servers listed in the Load Balancer's configuration.

   Inside the task for each server, we retrieve and update relevant server data.

   ![Fault tolerence snippet 3](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/66cd47cdeebcc88b0f54b6b81ccbc5834a88f4b0/Health3.svg)

   Using `Instant::now()` and calling `.elapsed()`, we record the server response time. We check if the server is responding by sending a `GET` request to each server with a set timeout and then update the server response time.  
   The subtraction from `lb.servers[index].connections` is done as to not count the connection opened by the health checker.

   ![Fault tolerence snippet 4](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/afb3a0517ad2f3b9278cc3cff7019ce12702e592/Health4.svg)

   This `match` block is used to handle the result of the HTTP request sent by the health checker.  
   If the HTTP request is completed sucessfully, we check if the response is an error code(like 404) or if the maximum connections limit is exceeded. This leads to marking of a server as dead and will not be used by the Load Balancer until it is checked again and marked as alive by the health checker.

   This marks the end of the Health Checker. After this, all the server tasks are awaited on to be periodically executed.  
   Here is a simple flowchart of how the health checking process works:

   ![Health check flow](https://gist.github.com/Prana-vvb/ff43110750c6fdfc21637e85debbf30a/raw/afb3a0517ad2f3b9278cc3cff7019ce12702e592/HealthCheckFlow.svg)

   Health checker reports as displayed in the terminal:

   ![Health check reports](https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdGkyeTM3eHAxdTB0aDVlcmwzN3Mwd3RxdnJ0N2IzYzl1NDlyN2JlYyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/psU5B2R73mbf6YlMha/giphy.gif)
<hr/>

## Benchmarks

We conducted several tests at different request rates per second (RPS).

![20,000 RPS](https://gist.github.com/user-attachments/assets/b17721e1-ec30-4f62-939a-c60ae04040d6)
<p align = "center"> Throughput VS Time at 20,000 RPS </p>

![25,000 RPS](https://gist.github.com/user-attachments/assets/661479e2-42b9-4772-a0ae-d67e06506637)
<p align = "center"> Throughput VS Time at 25,000 RPS </p>

![27,000 RPS](https://gist.github.com/user-attachments/assets/e0efbf0d-b752-4048-bfd0-18aa34c59d86)
<p align = "center"> Throughput VS Time at 27,000 RPS </p>

The tests had to be stopped here due to our hardware limitations but the trends we observed show us that the Bal.rs Load Balancer can handle much higher loads.
<hr/>

## Next Steps and Resources

- [Rust essentials](https://www.rust-lang.org/)
- [Asynchronous Programming in Rust using Tokio](tokio.rs/tokio/tutorial/async)
- [Basics of Load Balancing Algorithms](https://samwho.dev/load-balancing/)
- [Another Rust Load Balancer](https://github.com/another-rust-load-balancer/another-rust-load-balancer)
