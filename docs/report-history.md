# Compatible Allure history

Allure 3 reads a JSONL snapshot and appends the current launch to it. PostgreSQL stores the resulting points separately from normalized application analytics. Streams are partitioned by organization, project, approved local source lineage, environment, selection family, browser configuration and contract version. Reruns inherit their parent's selection family. The current approved source has one local lineage; remote branch approval remains separate work.

A renewable SQL lease serializes builders for a stream. History and the authorized worker's ready report pointer commit in one transaction using both history version and execution lease fencing. A stale builder cannot overwrite either. Rebuilding a run removes its earlier point before appending the replacement. Each stream retains at most 200 points and removes data older than 365 days.

History links use the authenticated application report route, not object URLs. Fresh report builds clear links to expired reports while retaining historical results. The execution screen links to compatible runs and labels expired reports separately. Reports already open still enforce current authorization and retention on every asset request.

Database tests cover simultaneous writers, stale commits, stream partitioning and expired-link removal. The browser journey builds two compatible runs, follows a history link, rebuilds without duplicating a point, and opens the stable authenticated Allure address.
