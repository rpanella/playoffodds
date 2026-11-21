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
        Schema::create('snapshots', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('league_id')->constrained();
            $table->foreignId('season_id')->constrained();
            // The instant the snapshot represents: games final before it count as played.
            $table->dateTime('as_of');
            $table->string('trigger', 16); // scheduled, game_final, backfill, manual
            $table->string('origin', 16); // live, reconstructed
            $table->string('status', 16); // running, published, failed
            $table->string('input_path')->nullable();
            $table->char('input_sha256', 64)->nullable();
            // Hash of the input without as_of and the seed: equal hashes mean nothing changed (02 §3 step 4).
            $table->char('content_sha256', 64)->nullable();
            // Hash of the engine CLI bundles that ran it; any engine or standings change alters it.
            $table->char('engine_build', 64)->nullable();
            $table->string('seed');
            $table->unsignedInteger('sims');
            $table->string('engine_version', 32)->nullable();
            $table->string('standings_version', 32)->nullable();
            $table->string('rules_id', 32)->nullable();
            $table->unsignedInteger('runtime_ms')->nullable();
            $table->json('diagnostics')->nullable();
            $table->text('error')->nullable();
            $table->ulid('superseded_by_id')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['season_id', 'status', 'as_of']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('snapshots');
    }
};
