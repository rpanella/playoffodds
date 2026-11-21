<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('snapshots', function (Blueprint $table) {
            // Hash of the final games and their scores in the input; the after-finals check compares it
            // with the mirror to tell whether a result has come in since this snapshot.
            $table->char('results_sha256', 64)->nullable()->after('content_sha256');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('snapshots', function (Blueprint $table) {
            $table->dropColumn('results_sha256');
        });
    }
};
