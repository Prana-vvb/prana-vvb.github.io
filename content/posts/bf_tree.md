---
title: "Notes on the Bf-Tree"
date: "2026-11-02"
tags: [Rust, Databases, Data Structures]
description: "A concurrent range index optimized for read-write workloads and datasets larger than memory"
author_name: Pranav V Bhat
collections: ["blog"]
---

Based on the research paper [Bf-Tree: A Modern Read-Write Optimized Concurrent Larger-Than-Memory Range Index](https://vldb.org/pvldb/vol17/p3442-hao.pdf)

## Why Bf-tree?
<hr/>

- [B(+)-Tree](https://en.wikipedia.org/wiki/B-tree) is the most widely used range index for larger than memory systems
- The B-Tree and other adjacent data structures organize data in pages of 4KB leading to inefficient caching and high [write amplification](https://wikipedia.org/wiki/Write_amplification#Basic_SSD_operation)
- Only a small subset of records in the cached page is actually hot and a single record update requires the entire page to be written to
- [LSM Trees](https://en.wikipedia.org/wiki/Log-structured_merge-tree) (using [RocksDB](https://rocksdb.org/) as a reference) use row level caching and append-only writes to reduce write amplification but at a higher cost for writes and compaction
- The [Bw-Tree](https://15721.courses.cs.cmu.edu/spring2016/papers/bwtree-icde2013.pdf) and similar range indexes are heavily write optimized through the use of *delta records* at the cost of slowing down reads and range scans
- Mitigation by modifications to the B-tree itself are complex and come with their own tradeoffs
- The root cause of the write amplification and inefficient caching is page based data organization
- Disk page size is >> individual record size => Coarse grained data management => Unnecessary data has to be managed along with the hot records
- Easily solved if disk page size = record size

## A Finer-Grained Approach to Caching and Writes
<hr/>

- Seperate cache pages from disk pages
- Cache only a small subset which is actually worth caching in *"mini-pages"*
- Mini-pages are part of the tree itself and not a seperate cache system
- Can cache individual records, a range, a page or act as a buffer for recent writes
- A mini-page can dynamically grow/shrink according to cache needs
- Problems faced with this approach:
    - Mini-pages are of variable length so their memory consumption has to be bounded to a configurable value
    - We should easily be able to manage and track used/unused memory for memory allocation/deallocation (Reminds me of a [GC](https://wikipedia.org/wiki/Garbage_collection_(computer_science)))
    - We should easily be able to identify hot and cold mini-pages to grow/shrink or evict them
    - Ensure data consistency and integrity with the on-disk leaf pages
    - All of the above should be handled efficiently in a multithreaded environment
- Solved by storing all mini-pages in a variable length ring buffer with a fixed, configurable max size 
- Allocation is done by advancing the tail pointer. Deallocation is done by adding mini-pages to a free list instead of immediate eviction
- Can cache both reads and writes & batch write to disk when eviction happens
- Use [`io_uring`]()'s kernel polling mode for efficient I/O

## Bf-Tree Architecture
<hr/>

- Similar to a regular B-Tree with inner nodes stored in-memory and leaf nodes stored on disk
- Difference is in the ring buffer pool cache also stored in-memory
- Other components include a mapping table for Page ID -> Physical address

![Source: Hao and Chandramouli, Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index; Page 4](https://gist.githubusercontent.com/user-attachments/assets/dac87aa3-d6d0-4df2-a556-697a65d5f412)

### Mini-Pages
<hr/>

- Corresponds to a leaf page and can range from 64B to 4KB
- Stores sorted records
- Writes are only to the mini-pages, not disk leaf pages. Disk pages get the writes in a batch when the corresponding mini-pages are evicted:

![Basic flow of inserting a record into the Bf-Tree](https://raw.githack.com/gist/Prana-vvb/af68ca525d10cb369cf1519b4d975fb4/raw/insert_flow.svg)

- Reads happen similar to a B-Tree

![Basic flow of a point read from the Bf-Tree](https://raw.githack.com/gist/Prana-vvb/af68ca525d10cb369cf1519b4d975fb4/raw/read_flow.svg)

- For range scans, a mini-page can grow to mirror a full leaf page automatically
- Memory layout of a mini-page = leaf page layout but mini-pages can have varying lengths instead of a fixed size like leaf pages

![Source: Hao and Chandramouli, Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index; Page 4](https://gist.githubusercontent.com/user-attachments/assets/48573450-9dba-4f4c-b40b-39f66557efb2)
- A `Node` is a mini-page. All metadata is stored from the start and the actual data is stored from the end of a mini-page. The same applies to leaf pages
- Seperation of metadata and data is also a good optimization as only the fixed size KV metadata has to be sorted on insertion and the data can be inserted in any available memory space
- Metadata is sorted by lookahead bytes (more on this in [Performance Optimizations](#performance-optimizations))
- A leaf page can have at most 1 associated mini-page
- Page IDs are stored in the mini-page and the corresponding leaf page's address can be found using the mapping table
- Mapping table is stored in memory and is implemented using indirection arrays since it is the simplest but can also use other techniques like [pointer swizzling](https://wikipedia.org/wiki/Pointer_swizzling) or directly using the OS page table

> [!NOTE]
> An indirection array is basically a hashmap but stores the key directly instead of hashing it

- The mapping table also reserves 16 bits to store the [RW lock](https://wikipedia.org/wiki/Readers-writer_lock) along with the leaf page address (48 bits) in a single 64 bit word. This way, when a mini-page is locked, the corresponding leaf page is also locked simplifying the locking mechanism and reducing overhead
- Inner nodes take are usually <1% of the total tree size but every leaf page access involves multiple inner node acceses
- The B-Tree used the same mapping table as cached page -> leaf page to map inner node page IDs -> inner node addresses, creating a contention hotspot and translation overhead
- The Bf-Tree instead pins inner nodes in memory and uses direct pointer addressing. This also means that only leaf nodes have to be cached

- Pinning inner nodes is a configurable option as constrained systems may not have enough memory to store all inner nodes. Users can choose to pin only a few levels or use the mapping table technique from B-Trees

- Inner nodes are highly contended for reads but rarely modified => [Optimistic lock coupling](https://cedardb.com/blog/optimistic_btrees/#synchronization-with-lock-coupling) can be used. The Bf-Tree uses an 8 byte version lock and since reads don't pollute cache lines, cache coherence traffic is avoided

### Ring Buffer Pool
<hr/>

- Manages the memory of all mini-pages and deals with fragmentation

- Tracks hotness of each mini-page and evicts cold ones

- Concurrently performs allocation/eviction while maintaining memory safety

- A circular buffer solves memory management and fragmentation since we add only to the tail until the buffer is full

- Eviction uses a FIFO policy. But pure FIFO cannot be used as pages close to the head may still be hot

- Solved by having a *"second chance"* pointer in the buffer, dividing the whole buffer into 2 regions. When mini-pages are in the
    - Head -> Second chance region: Copy the mini-pages in this region to the tail on access to "refresh" its cached version and mark the old version for eviction
    - Second chance -> Tail region: Modify in-place as usual

- Location of the second chance pointer can be configured
    - Defaults to 10% Head -> Second chance and 90% Second chance -> Tail
    - When Second chance ptr = Head ptr, acts as a strict FIFO queue since no mini-page can be in the second chance region and thus, cannot be copied to the tail
    - When Second chance ptr = Tail ptr, acts as a strict LRU queue since all of the mini-pages are included in the second chance region, any page on access would be copied to the tail

- Eviction of the mini-pages happens when the buffer is full or when copying mini-pages from the second chance region to the tail

- Design inspired by the [FASTER Hybrid Log](https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/faster-sigmod18.pdf#section.6)

![Source: Hao and Chandramouli, Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index; Page 6](https://gist.githubusercontent.com/user-attachments/assets/d25e7c3f-12db-43fc-a538-9465ecc2b107)

- Mini-page deallocations are tracked using a [free list](https://wikipedia.org/wiki/Free_list), also stored in the ring buffer. The memory is not directly freed but just marked as free. Future allocations reuse this memory space

- The circular buffer supports 3 main operations:
    - ***`Alloc`***: Prefers to allocate on the free list. Allocate at the tail only if there is not enough space in the free list. Returns an error if the buffer is full, requiring eviction to free up space
    - ***`Eviction`***: As described above, evicts the mini-page closest to the Head pointer and invokes a callback function to merge any evicted dirty pages to the leaf page on disk. This can happen concurrently (more on this in [Performance Optimizations](#performance-optimizations))
    - ***`Dealloc`***: Simply adds the memory region to the free list

### Core Operations
<hr/>

**Operations of the Ring Buffer:**
- ***`GET`***: Traverse to the mini-page and search for the key as described in [Mini-Pages](#mini-pages). If the record is not found in the mini-page, load the record from disk and cache it with a configurable probability i.e. if the `probability` is `x%`, then the loaded record has an `x%` chance of being cached in the mini-page (Defaults to 20%)

```python caption="Source: Hao and Chandramouli, Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index; Page 7"
def get(key):
    (mini_page, leaf_page) = traverse(key)
    if mini_page:
        result = mini_page.binary_search(key)
        if result:
            # early terminate if found
            return result

    # otherwise, read from the leaf page
    result = leaf_page.binary_search(key)    
    if rand() < probability:
        # with a small probability, cache it in the mini−page
        mini_page.insert_or_create(result)

    return result
```

- ***`INSERT`***/***`UPDATE`***: Traverse to the mini-page. If it does not exist, create a new mini-page of size = size of the record being inserted. If the mini-page exists and there is no space to accomodate the record, grow the mini-page if possible otherwise merge the mini page to disk and retry the insertion

```python caption="Source: Hao and Chandramouli, Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index; Page 7"
def insert(key, value):
    (mini_page, _leaf_page) = traverse(key)
    ok = mini_page.insert(key, value)
    if ok:
        # early terminate if insert succeeds
        return    

    new_size = mini_page.next_size()
    if new_size == 0:
        # need to merge to the leaf page since mini-page cannot grow
        mini_page.merge()
        mini_page.insert(key, value)
        return
    else:
        # need to grow the mini−page
        mini_page.resize(new_size)
        mini_page.insert(key, value)
        return
```

- ***`SCAN`***: Involves scanning a range of records and merging them to get the final result. Frequently scanned mini-pages can griw to full leaf page size and act as a page level cache like in a B-Tree

- ***`DELETE`***: Deleting = Inserting a tombstone record. When a mini-page is merged to the leaf, records marked as tombstones are removed from the leaf if they exist

<br/><br/>
**Operations on Mini-Pages:**
- ***`MERGE`***: Done if the mini-page is too large (> 2KB) or if it is cold. The address of the corresponding leaf page to a mini-page is stored in the mini-page header to make it easier to find

![Flow of a merge operation](https://raw.githack.com/gist/Prana-vvb/af68ca525d10cb369cf1519b4d975fb4/raw/min-page_merge.svg)

- ***`COPY TO TAIL`***: A mini-page in the Head -> Second chance region is copied to the tail when accessed as described in the [Ring Buffer Pool](#ring-buffer-pool). The old mini-page that is still near the head is marked as a tombstone without evicting it

- ***`EVICTION`***: Cold records are evicted when the buffer is full or when a `COPY TO TAIL` operation takes place. Hot and cold records are differentiated by a reference bit (0 if cold) stored in the record metadata. A freshly cached record has it's reference bit set. When eviction starts, all records with the reference bit 0 are evicted and all other records are cleared to 0. The reference bit is set again if the record is accessed. Evicted records are merged back to the leaf along with their whole mini-page if dirty to maximise disk utility. An individual record not accessed while in the Second chance -> Tail region is individually evicted while the entire mini-page is evicted when in the Head -> Second chance region

- ***`LEAF PAGE SPLIT`***: Same as a conventional B-Tree

![B-Tree leaf page split; Source: bobson.ludost.net](https://bobson.ludost.net/books/algo/book6/391_a.gif)

<br/><br/>
**Other Operations:**
- ***`NEGATIVE SEARCH`***: Negative searches are not handled well in existing record caching systems as a record which is not found in the cache may either mean that the record simply has not been cached or that the record does not exist at all leading to unnecessary disk I/O. The Bf-Tree solves this by caching negative searches too as a `phantom record`

> [!NOTE]
> A Negative Search is an operation that tries to find a record that does not exist

![Source: Hao and Chandramouli, Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index; Page 8](https://gist.githubusercontent.com/user-attachments/assets/df31e3d8-104d-43b3-aa70-697796c4aae6)

- ***`SNAPSHOTTING, LOGGING and RECOVERY`***: Compatible with standard mechanisms like [`ARIES`](https://wikipedia.org/wiki/Algorithms_for_Recovery_and_Isolation_Exploiting_Semantics) and [Amazon Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html). The Bf-Tree currently implements an `ARIES` style mechanism.
    - Logging with a [`WAL`](https://wikipedia.org/wiki/Write-ahead_logging)
    - Snapshotting/Checkpointing can be done both offline and online. Offline checkpointing is asynchronous and is achieved by replaying `WAL` entries in parallel. Online checkpointing is done by pausing writes and writing back dirty mini-pages to disk
        - The snapshot file also contains the mapping table appended to the end and a special mapping table that maps inner nodes' virtual addresses to their physical offset
    - Recovery consists of 2 steps:
        - Build a representation from the snapshot file
        - Replay the `WAL`

## Performance Optimizations
<hr/>

**Node Layout Optimizations:**
Most of these are standard optimization techniques to modern B-Trees
- [***`Fence Keys`***](https://www.google.co.in/books/edition/Modern_B_Tree_Techniques/AiOj6n7-s_UC?gbpv=1&pg=PA79): A `Low` (the first key) and a `High` (the second key) fence key are stored in each node to help determine neighbours for range queries. `Low` points to the left neighbour and `High` points to the right neighbour, allowing us to traverse to the previous/next node without having to go back to the common root and avoid pointer chasing

![The Prev and Next arrows represent the logical neighbour relationship, not actual pointers](https://raw.githack.com/gist/Prana-vvb/af68ca525d10cb369cf1519b4d975fb4/raw/fence.svg)

- [***`Prefix Compression`***](https://www.google.co.in/books/edition/Modern_B_Tree_Techniques/AiOj6n7-s_UC?gbpv=1&pg=PA37): The Bf-Tree uses the fence keys to determine the common prefix shared by all keys within a node. It is determined by the Longest Common Prefix between the `Low` and `High` fence keys. When inserting records into a node, the common prefix is skipped and only the suffix is stored

![The derived prefix is implicit and not actually stored](https://raw.githack.com/gist/Prana-vvb/af68ca525d10cb369cf1519b4d975fb4/raw/prefix_compression.svg)

- ***`Lookahead Bytes`***: This is an optimization specific to the Bf-Tree. The metadata and actual records being stored seperately ([Mini-Pages](#mini-pages)) may lead to higher random memory accesses for key comparison (Load metadata -> Load actual key -> Compare). This process is accelerated by storing the first 2 bytes of the actual key (Lookahead bytes) in the metadata and comparing with them first. This is again aided by `Prefix Compression` as the first 2 bytes are usually unique because of it, allowing searches to terminate early

**Buffer Pool Optimizations:**
- ***`Memory Fragmentation`***: Mini-pages do not need to be aligned to OS page memory boundaries since there is no concept of paging here. This means that they can be stored without any spaces in between them thus minimizing fragmentation

- ***`Memory Alignment`***: Mini-pages are allocated aligned to an 8 byte boundary (different from OS page alignment) and may cross the 4KB page boundary sometimes and incur boundary crossing overhead. This can be mitigated by using [Linux Huge Table](https://docs.kernel.org/admin-guide/mm/hugetlbpage.html) to store the entire ring buffer in 1 huge page of 2MB or 1GB

- ***`Concurrent Eviction`***: Eviction involves moving the Head pointer so that the Tail can then be advanced and is a linear operation. This is parallelized by allowing multiple threads to start eviction concurrently but the Head pointer can only be moved when all threads have finished their eviction and only in order (Parallel Eviction with Ordered Completion)

## Benchmarks
<hr/>

- Runs a [YCSB like benchmark](https://wikipedia.org/wiki/YCSB) with 200 million initial records of 32 bytes (16-byte key and 16-byte value) each.
- Zip-f distribution with a skew factor of 0.9 (80% of requests access 33% of records)
- The default workload consists of 50% of reads and 50% of writes with 2GB memory cache
- The system is warmed up first and the benchmark is repeated five times, reporting the best throughput.
- Baselines:
    - [`RocksDB`](rocksdb.org): As a LSM Tree based KV store, optimized for both read and write workloads
    - Conventional `B-Tree`: In Rust with all the optimizations to the Bf-Tree except the mini-pages
    - `Bδ-Tree`: The above B-Tree design but with delta records, mimicking the [Bw-Tree](https://15721.courses.cs.cmu.edu/spring2016/papers/bwtree-icde2013.pdf). Delta records and pages are cached in the circular buffer that the Bf-Tree has
    - [`Leanstore`](https://github.com/leanstore/leanstore): B-Tree based store that is optimized by reducing the mapping table overhead
    - [`TwoTree`](https://www.cidrdb.org/cidr2023/papers/p57-zhou.pdf): New structure that reuses existing components to build record caching systems

- Overall, the Bf-Tree has the highest throughput and least I/O usage for point lookups and writes. It ties with the B-tree in both metrics for range scans due to all B-Tree variants caching the entire leaf page in the memory, preserving record locality
- Very good for modern NVMes

<hr/>

More discussion on [lobste.rs](https://lobste.rs/s/651hoq/bf_tree_modern_concurrent_larger_than)
