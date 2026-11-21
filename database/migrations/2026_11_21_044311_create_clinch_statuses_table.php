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
        Schema::create('clinch_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('snapshot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('season_team_id')->constrained();
            $table->string('target', 16); // playoffs, division, top_seed
            $table->string('status', 16); // clinched, eliminated, alive
            // Wins every remaining game, it clinches regardless of other results.
            $table->boolean('controls_destiny');
            // A search hit its time limit, so an alive status makes no claim.
            $table->boolean('timed_out')->default(false);
            $table->string('method_version', 32); // e.g. conservative-bnb@1
            // Room for a witness summary later, e.g. the results that keep an alive team out.
            $table->json('details')->nullable();

            $table->unique(['snapshot_id', 'season_team_id', 'target']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clinch_statuses');
    }
};
