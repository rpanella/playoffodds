<?php

namespace App\Services\Snapshots;

/** Another run holds the season's lock; try again shortly. */
class SnapshotLockedException extends SnapshotException {}
