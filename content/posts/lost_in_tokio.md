---
title: "Lost in Tokio" 
date: "2026-07-21"
tags: [Rust, async, threads]
description: "Exploring the architecture of Rust's most popular Async Runtime"
permalink: posts/{{ title | slug }}/index.html
author_name: Pranav V Bhat
author_link: "https://github.com/Prana-vvb"
collections: ["blog"]
---

This post focuses on the architecture of [Tokio](https://tokio.rs/), Rust's most popular async runtime. But to understand Tokio and why it exists, we must first look at the problems it was built to solve.

## Level 0: Synchronous programming

Most code that you write is executed sequentially<br/><br/>

<div class="code-wrapper"><pre><code class="language-rust">fn synchronous() {&#10;    println!("1");&#10;    println!("2");&#10;    println!("3");&#10;}</code></pre><div class="code-caption">Completely innocent synchronous function</div></div>

This *synchronous* way is perfectly fine for most tasks, but some operations (like network requests or I/O waits) in the chain can be painfully slow.
They 'block' the program from progressing until they are done, resulting in your application just sitting there doing nothing.<br/><br/>

<div class="code-wrapper"><pre><code class="language-rust">fn evil_synchronous() {&#10;    println!("Requesting user data...");&#10;    &#10;    // Execution cannot continue until the database responds.&#10;    let response = get_from_db("Geronimo").unwrap(); &#10;    &#10;    println!("Got data: {response}");&#10;}</code></pre><div class="code-caption">Evil and intimidating blocking code</div></div>

Blocking delays like this are common when applications wait for I/O operations to finish. But what if your program could do other work while it waits?

## Level 1: Concurrency and Parallelism through OS Threads

A very naive way to do this would be to [create a new process for each task](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/04/fork-hotos19.pdf#page=2). But this would be very expensive as a new process would require its own isolated memory context and common data would have to be passed between these processes.

Instead, we use multiple [*threads*](https://en.wikipedia.org/wiki/Thread_(computing)) inside a single process.
> *Thread*: The smallest sequence of programmed instructions that can be managed independently by a scheduler.

In Rust, we can use the native `std::thread` interface<br/><br/>

<div class="code-wrapper"><pre><code class="language-rust">use std::thread;&#10;use std::time::Duration;&#10;&#10;fn main() {&#10;    let handle = thread::spawn(|| {&#10;        for i in 1..10 {&#10;            println!("Spawned thread {i}");&#10;            thread::sleep(Duration::from_millis(1));&#10;        }&#10;    });&#10;&#10;    for i in 1..5 {&#10;        println!("{i} from the main thread");&#10;        thread::sleep(Duration::from_millis(1));&#10;    }&#10;&#10;    handle.join().unwrap(); // main thread should not exit until all spawned threads are done&#10;}</code></pre><div class="code-caption">Concurrent execution with OS threads (From doc.rust-lang.org/book/ch16-01-threads.html)</div></div>

> [!NOTE]
> [**The basic difference between Concurrency and Parallelism**](https://rust-lang.github.io/book/ch17-00-async-await.html#parallelism-and-concurrency)
>
> **Concurrency** is about structuring multiple independent tasks to execute and progress in overlapping time periods. On a single core, the OS achieves this by rapidly switching between tasks.
>
> **Parallelism** is when tasks are literally run at the same time across multiple CPU cores.

Although OS threads provide concurrency (and parallelism on multi-core hardware) and are cheaper than creating an entirely new process, they still are relatively expensive.

Historically, the simplest way to handle network traffic was to spawn one OS thread per connection. However, OS threads are heavy.
On Linux, each thread reserves a default 8MB of virtual memory for its stack. If an application tried to serve 100,000 concurrent connections this way, it would demand 800GB of virtual address space.

But virtual address space is cheap and abundant on modern systems. The real problem is that the OS kernel has to constantly pause and resume these threads (context switching). This is significantly more expensive while also potentially invalidating cache locality. The CPU would spend all its time just juggling threads rather than doing actual work.

## Level 2: Cooperative Multitasking with [async/.await](https://os.phil-opp.com/async-await/)

> [!NOTE]
> [Preemptive VS Cooperative multitasking](https://www.geeksforgeeks.org/operating-systems/difference-between-preemptive-and-cooperative-multitasking/)
>
> **Preemptive multitasking**: The OS allocates each thread a time slice to execute in and forcibly pauses the thread when its time is up no matter what it is doing and runs the next scheduled thread.
>
> **Cooperative multitasking**: Each task voluntarily yields control back when it is idle or has hit a blocking point, giving us a lower context switching overhead.

Luckily for us, Rust provides a [zero-cost abstraction](https://stackoverflow.com/a/69178445) in the form of the [`Future`](https://rust-lang.github.io/async-book/02_execution/02_future.html) trait. Futures are analogous to a `Promise` from JavaScript, with the main difference being that a `Promise` is eagerly executed by the JavaScript runtime while a `Future` is lazy until it is polled.

Polling is basically giving the future the opportunity to progress by asking, "Hey, make some progress on your work now" The `Future` can then respond with either "No, I can't progress now" (`Poll::Pending`) or "Yes, I'm done. Here is the result" (`Poll::Ready(val)`).

Rust gives us the `async/.await` syntax, allowing us to write asynchronous code in a way that looks similar to synchronous code. This syntax will be [familiar if you're coming from JavaScript or Python](https://en.wikipedia.org/wiki/Async/await#Implementations).

For example:<br/><br/>

<div class="code-wrapper"><pre><code class="language-rust">fn synchronous_io() {&#10;    let resp = fetch_data();&#10;    println!("{resp}");&#10;}</code></pre><div class="code-caption">Standard, blocking I/O</div></div>

Can be written as:<br/><br/>

<div class="code-wrapper"><pre><code class="language-rust">async fn asynchronous_io() {&#10;    let resp = fetch_data_async().await;&#10;    println!("{resp}");&#10;}</code></pre><div class="code-caption">Asynchronous I/O using async/.await</div></div>

As you can see, the main differences are the `async` keyword in the function definition and the `.await` postfix operator after an async function call.<br/>
But what exactly are they doing?

**`async`** transforms your function into a [state machine](https://en.wikipedia.org/wiki/Finite-state_machine) that implements the `Future` trait. Each `.await` marks a suspension point and the boundary between different states, allowing the state machine to pause and resume at these points. This state machine also stores context such as local variables, and child Futures that are being awaited.

When execution reaches an `.await`, the future being awaited is polled. If it is ready, execution continues normally.
Otherwise, the state machine saves its current state, returns `Poll::Pending` to the caller and yields control so that other work can be done while waiting.
Before doing so, the awaited future typically stores a [`Waker`](https://doc.rust-lang.org/beta/std/task/struct.Waker.html) that can later be used to arrange for the task to be polled again when progress becomes possible.

Later, when the async function is polled again, the state machine resumes execution from the previously saved state.

![Simplified state machine generated from async fn asynchronous_io()](https://gist.githubusercontent.com/Prana-vvb/7a1472b97344d5bbc596021ed9d0c9c0/raw/1192d18e545b612c58f1c13ea6e1bc64dabab033/tokio1.svg)

Very neat! Now let us run this function.

```rust
fn main() {
    // Remember we need to await a Future to progress it since they are lazy
    asynchronous_io().await;
}
```

Oh no! The Rust compiler requires any function that calls an async function to also be declared with `async`

```sh
error[E0728]: `await` is only allowed inside `async` functions and blocks
 --> src/main.rs:6:23
  |
5 | fn main() {
  | --------- this is not `async`
6 |     asynchronous_io().await;
  |                       ^^^^^ only allowed inside `async` functions and blocks

For more information about this error, try `rustc --explain E0728`.
```

This is because `.await` is a potential suspension point. If the awaited `Future` isn't ready yet, the caller must save its current state, yield control, and later resume execution from where it left off. Ordinary functions are not capable of doing this, only functions marked with `async` are.

So no worries, we will just declare `main` also with the `async` keyword.
Unfortunately, this too does not work.

```sh
error[E0752]: `main` function is not allowed to be `async`
 --> src/main.rs:5:1
  |
5 | async fn main() {
  | ^^^^^^^^^^^^^^^ `main` function is not allowed to be `async`

For more information about this error, try `rustc --explain E0752`.
```

The reason `main` cannot be `async` is that someone has to drive the `Future` returned by `main` also to completion.

An async fn doesn't execute by itself. Calling it just constructs a value containing all the state required to perform the work, but not when. Futures are lazy, so unless something repeatedly polls them, they never make progress. So who does the polling?

## Level 3: Async runtimes

This is where an async runtime comes into play. Most languages that support async have an async runtime built into the core language runtime and thus support async functions out of the box. Rust on the other hand provides only the foundation such as the `Future` and the `async/.await` syntax but no async runtime.

This is mainly due to Rust being used in many different areas from web development to systems and bare metal/embedded. There no consensus on a "One True Async Runtime" capable of supporting all of them perfectly. Instead, it is up to the developer to choose from many different community provided crates tailored to their use case.

> "Rust caters to a vast array of use cases. We simply cannot bundle everything into the core standard library, but the ecosystem provides a crate for almost every need. Just use one of those"
> — Paraphrased quote from [Niko Matsakis](https://smallcultfollowing.com/babysteps/), Core developer on the Rust programming language
