<?php

namespace App\Services\Snapshots;

use RuntimeException;

/** A snapshot run that can't proceed: missing odds, an engine failure, another run in progress. */
class SnapshotException extends RuntimeException {}
