<?php

namespace App\Services\SportsCrunch;

use RuntimeException;

/** SportsCrunch data PlayoffOdds can't use as sent: unknown teams or conferences, a missing season. */
class SportsCrunchException extends RuntimeException {}
