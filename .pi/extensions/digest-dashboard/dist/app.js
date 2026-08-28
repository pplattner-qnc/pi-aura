(function() {
  "use strict";
  const DEV = false;
  var is_array = Array.isArray;
  var index_of = Array.prototype.indexOf;
  var includes = Array.prototype.includes;
  var array_from = Array.from;
  var define_property = Object.defineProperty;
  var get_descriptor = Object.getOwnPropertyDescriptor;
  var get_descriptors = Object.getOwnPropertyDescriptors;
  var object_prototype = Object.prototype;
  var array_prototype = Array.prototype;
  var get_prototype_of = Object.getPrototypeOf;
  var is_extensible = Object.isExtensible;
  const noop = () => {
  };
  function run_all(arr) {
    for (var i = 0; i < arr.length; i++) {
      arr[i]();
    }
  }
  function deferred() {
    var resolve;
    var reject;
    var promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  const DERIVED = 1 << 1;
  const EFFECT = 1 << 2;
  const RENDER_EFFECT = 1 << 3;
  const MANAGED_EFFECT = 1 << 24;
  const BLOCK_EFFECT = 1 << 4;
  const BRANCH_EFFECT = 1 << 5;
  const ROOT_EFFECT = 1 << 6;
  const BOUNDARY_EFFECT = 1 << 7;
  const CONNECTED = 1 << 9;
  const CLEAN = 1 << 10;
  const DIRTY = 1 << 11;
  const MAYBE_DIRTY = 1 << 12;
  const INERT = 1 << 13;
  const DESTROYED = 1 << 14;
  const REACTION_RAN = 1 << 15;
  const DESTROYING = 1 << 25;
  const EFFECT_TRANSPARENT = 1 << 16;
  const EAGER_EFFECT = 1 << 17;
  const HEAD_EFFECT = 1 << 18;
  const EFFECT_PRESERVED = 1 << 19;
  const USER_EFFECT = 1 << 20;
  const EFFECT_OFFSCREEN = 1 << 25;
  const WAS_MARKED = 1 << 16;
  const REACTION_IS_UPDATING = 1 << 21;
  const ASYNC = 1 << 22;
  const ERROR_VALUE = 1 << 23;
  const STATE_SYMBOL = /* @__PURE__ */ Symbol("$state");
  const LOADING_ATTR_SYMBOL = /* @__PURE__ */ Symbol("");
  const ATTRIBUTES_CACHE = /* @__PURE__ */ Symbol("attributes");
  const CLASS_CACHE = /* @__PURE__ */ Symbol("class");
  const STYLE_CACHE = /* @__PURE__ */ Symbol("style");
  const TEXT_CACHE = /* @__PURE__ */ Symbol("text");
  const STALE_REACTION = new class StaleReactionError extends Error {
    name = "StaleReactionError";
    message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
  }();
  function async_derived_orphan() {
    {
      throw new Error(`https://svelte.dev/e/async_derived_orphan`);
    }
  }
  function each_key_duplicate(a, b, value) {
    {
      throw new Error(`https://svelte.dev/e/each_key_duplicate`);
    }
  }
  function effect_in_teardown(rune) {
    {
      throw new Error(`https://svelte.dev/e/effect_in_teardown`);
    }
  }
  function effect_in_unowned_derived() {
    {
      throw new Error(`https://svelte.dev/e/effect_in_unowned_derived`);
    }
  }
  function effect_orphan(rune) {
    {
      throw new Error(`https://svelte.dev/e/effect_orphan`);
    }
  }
  function effect_update_depth_exceeded() {
    {
      throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
    }
  }
  function state_descriptors_fixed() {
    {
      throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
    }
  }
  function state_prototype_fixed() {
    {
      throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
    }
  }
  function state_unsafe_mutation() {
    {
      throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
    }
  }
  function svelte_boundary_reset_onerror() {
    {
      throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
    }
  }
  const EACH_ITEM_REACTIVE = 1;
  const EACH_INDEX_REACTIVE = 1 << 1;
  const EACH_IS_CONTROLLED = 1 << 2;
  const EACH_IS_ANIMATED = 1 << 3;
  const EACH_ITEM_IMMUTABLE = 1 << 4;
  const TEMPLATE_FRAGMENT = 1;
  const TEMPLATE_USE_IMPORT_NODE = 1 << 1;
  const UNINITIALIZED = /* @__PURE__ */ Symbol("uninitialized");
  const NAMESPACE_HTML = "http://www.w3.org/1999/xhtml";
  function derived_inert() {
    {
      console.warn(`https://svelte.dev/e/derived_inert`);
    }
  }
  function svelte_boundary_reset_noop() {
    {
      console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
    }
  }
  function equals(value) {
    return value === this.v;
  }
  function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || a !== null && typeof a === "object" || typeof a === "function";
  }
  function safe_equals(value) {
    return !safe_not_equal(value, this.v);
  }
  let tracing_mode_flag = false;
  let component_context = null;
  function set_component_context(context) {
    component_context = context;
  }
  function push(props, runes = false, fn) {
    component_context = {
      p: component_context,
      i: false,
      c: null,
      e: null,
      s: props,
      x: null,
      r: (
        /** @type {Effect} */
        active_effect
      ),
      l: null
    };
  }
  function pop(component) {
    var context = (
      /** @type {ComponentContext} */
      component_context
    );
    var effects = context.e;
    if (effects !== null) {
      context.e = null;
      for (var fn of effects) {
        create_user_effect(fn);
      }
    }
    context.i = true;
    component_context = context.p;
    return (
      /** @type {T} */
      {}
    );
  }
  function is_runes() {
    return true;
  }
  let micro_tasks = [];
  function run_micro_tasks() {
    var tasks = micro_tasks;
    micro_tasks = [];
    run_all(tasks);
  }
  function queue_micro_task(fn) {
    if (micro_tasks.length === 0 && true) {
      var tasks = micro_tasks;
      queueMicrotask(() => {
        if (tasks === micro_tasks) run_micro_tasks();
      });
    }
    micro_tasks.push(fn);
  }
  function handle_error(error) {
    var effect = active_effect;
    if (effect === null) {
      active_reaction.f |= ERROR_VALUE;
      return error;
    }
    if ((effect.f & REACTION_RAN) === 0 && (effect.f & EFFECT) === 0) {
      throw error;
    }
    invoke_error_boundary(error, effect);
  }
  function invoke_error_boundary(error, effect) {
    if (effect !== null && (effect.f & DESTROYED) !== 0) {
      return;
    }
    while (effect !== null) {
      if ((effect.f & BOUNDARY_EFFECT) !== 0) {
        if ((effect.f & REACTION_RAN) === 0) {
          throw error;
        }
        try {
          effect.b.error(error);
          return;
        } catch (e) {
          error = e;
        }
      }
      effect = effect.parent;
    }
    throw error;
  }
  const STATUS_MASK = -7169;
  function set_signal_status(signal, status) {
    signal.f = signal.f & STATUS_MASK | status;
  }
  function update_derived_status(derived2) {
    if ((derived2.f & CONNECTED) !== 0 || derived2.deps === null) {
      set_signal_status(derived2, CLEAN);
    } else {
      set_signal_status(derived2, MAYBE_DIRTY);
    }
  }
  function clear_marked(deps) {
    if (deps === null) return;
    for (const dep of deps) {
      if ((dep.f & DERIVED) === 0 || (dep.f & WAS_MARKED) === 0) {
        continue;
      }
      dep.f ^= WAS_MARKED;
      clear_marked(
        /** @type {Derived} */
        dep.deps
      );
    }
  }
  function defer_effect(effect, dirty_effects, maybe_dirty_effects) {
    if ((effect.f & DIRTY) !== 0) {
      dirty_effects.add(effect);
    } else if ((effect.f & MAYBE_DIRTY) !== 0) {
      maybe_dirty_effects.add(effect);
    }
    clear_marked(effect.deps);
    set_signal_status(effect, CLEAN);
  }
  function without_reactive_context(fn) {
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(null);
    set_active_effect(null);
    try {
      return fn();
    } finally {
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
  }
  function createSubscriber(start) {
    let subscribers = 0;
    let version = source(0);
    let stop;
    return () => {
      if (effect_tracking()) {
        get(version);
        render_effect(() => {
          if (subscribers === 0) {
            stop = untrack(() => start(() => increment(version)));
          }
          subscribers += 1;
          return () => {
            queue_micro_task(() => {
              subscribers -= 1;
              if (subscribers === 0) {
                stop?.();
                stop = void 0;
                increment(version);
              }
            });
          };
        });
      }
    };
  }
  var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED;
  function boundary(node, props, children, transform_error) {
    new Boundary(node, props, children, transform_error);
  }
  class Boundary {
    /** @type {Boundary | null} */
    parent;
    is_pending = false;
    /**
     * API-level transformError transform function. Transforms errors before they reach the `failed` snippet.
     * Inherited from parent boundary, or defaults to identity.
     * @type {(error: unknown) => unknown}
     */
    transform_error;
    /** @type {TemplateNode} */
    #anchor;
    /** @type {TemplateNode | null} */
    #hydrate_open = null;
    /** @type {BoundaryProps} */
    #props;
    /** @type {((anchor: Node) => void)} */
    #children;
    /** @type {Effect} */
    #effect;
    /** @type {Effect | null} */
    #main_effect = null;
    /** @type {Effect | null} */
    #pending_effect = null;
    /** @type {Effect | null} */
    #failed_effect = null;
    /** @type {DocumentFragment | null} */
    #offscreen_fragment = null;
    #local_pending_count = 0;
    #pending_count = 0;
    #pending_count_update_queued = false;
    /** @type {Set<Effect>} */
    #dirty_effects = /* @__PURE__ */ new Set();
    /** @type {Set<Effect>} */
    #maybe_dirty_effects = /* @__PURE__ */ new Set();
    /**
     * A source containing the number of pending async deriveds/expressions.
     * Only created if `$effect.pending()` is used inside the boundary,
     * otherwise updating the source results in needless `Batch.ensure()`
     * calls followed by no-op flushes
     * @type {Source<number> | null}
     */
    #effect_pending = null;
    #effect_pending_subscriber = createSubscriber(() => {
      this.#effect_pending = source(this.#local_pending_count);
      return () => {
        this.#effect_pending = null;
      };
    });
    /**
     * @param {TemplateNode} node
     * @param {BoundaryProps} props
     * @param {((anchor: Node) => void)} children
     * @param {((error: unknown) => unknown) | undefined} [transform_error]
     */
    constructor(node, props, children, transform_error) {
      this.#anchor = node;
      this.#props = props;
      this.#children = (anchor) => {
        var effect = (
          /** @type {Effect} */
          active_effect
        );
        effect.b = this;
        effect.f |= BOUNDARY_EFFECT;
        children(anchor);
      };
      this.parent = /** @type {Effect} */
      active_effect.b;
      this.transform_error = transform_error ?? this.parent?.transform_error ?? ((e) => e);
      this.#effect = block(() => {
        {
          this.#render();
        }
      }, flags);
    }
    #hydrate_resolved_content() {
      try {
        this.#main_effect = branch(() => this.#children(this.#anchor));
      } catch (error) {
        this.error(error);
      }
    }
    /**
     * @param {unknown} error The deserialized error from the server's hydration comment
     */
    #hydrate_failed_content(error) {
      const failed = this.#props.failed;
      const { reset, invoke_onerror } = this.#create_reset(error);
      queue_micro_task(invoke_onerror);
      if (!failed) return;
      this.#failed_effect = branch(() => {
        failed(
          this.#anchor,
          () => error,
          () => reset
        );
      });
    }
    /**
     * Creates the `reset` function for a failed boundary, along with a function
     * that invokes `onerror` with it (if provided)
     * @param {unknown} error
     * @returns {{ reset: () => void, invoke_onerror: () => void }}
     */
    #create_reset(error) {
      var did_reset = false;
      var calling_on_error = false;
      const reset = () => {
        if (did_reset) {
          svelte_boundary_reset_noop();
          return;
        }
        did_reset = true;
        if (calling_on_error) {
          svelte_boundary_reset_onerror();
        }
        if (this.#failed_effect !== null) {
          pause_effect(this.#failed_effect, () => {
            this.#failed_effect = null;
          });
        }
        this.#run(() => {
          this.#render();
        });
      };
      const invoke_onerror = () => {
        try {
          calling_on_error = true;
          this.#props.onerror?.(error, reset);
          calling_on_error = false;
        } catch (err) {
          invoke_error_boundary(err, this.#effect && this.#effect.parent);
        }
      };
      return { reset, invoke_onerror };
    }
    #hydrate_pending_content() {
      const pending = this.#props.pending;
      if (!pending) return;
      this.is_pending = true;
      this.#pending_effect = branch(() => pending(this.#anchor));
      queue_micro_task(() => {
        var fragment = this.#offscreen_fragment = document.createDocumentFragment();
        var anchor = create_text();
        fragment.append(anchor);
        this.#main_effect = this.#run(() => {
          return branch(() => this.#children(anchor));
        });
        if (this.#pending_count === 0) {
          this.#anchor.before(fragment);
          this.#offscreen_fragment = null;
          pause_effect(
            /** @type {Effect} */
            this.#pending_effect,
            () => {
              this.#pending_effect = null;
            }
          );
          this.#resolve(
            /** @type {Batch} */
            current_batch
          );
        }
      });
    }
    #render() {
      try {
        this.is_pending = this.has_pending_snippet();
        this.#pending_count = 0;
        this.#local_pending_count = 0;
        this.#main_effect = branch(() => {
          this.#children(this.#anchor);
        });
        if (this.#pending_count > 0) {
          var fragment = this.#offscreen_fragment = document.createDocumentFragment();
          move_effect(this.#main_effect, fragment);
          const pending = (
            /** @type {(anchor: Node) => void} */
            this.#props.pending
          );
          this.#pending_effect = branch(() => pending(this.#anchor));
        } else {
          this.#resolve(
            /** @type {Batch} */
            current_batch
          );
        }
      } catch (error) {
        this.error(error);
      }
    }
    /**
     * @param {Batch} batch
     */
    #resolve(batch) {
      this.is_pending = false;
      batch.transfer_effects(this.#dirty_effects, this.#maybe_dirty_effects);
    }
    /**
     * Defer an effect inside a pending boundary until the boundary resolves
     * @param {Effect} effect
     */
    defer_effect(effect) {
      defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
    }
    /**
     * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
     * @returns {boolean}
     */
    is_rendered() {
      return !this.is_pending && (!this.parent || this.parent.is_rendered());
    }
    has_pending_snippet() {
      return !!this.#props.pending;
    }
    /**
     * @template T
     * @param {() => T} fn
     */
    #run(fn) {
      var previous_effect = active_effect;
      var previous_reaction = active_reaction;
      var previous_ctx = component_context;
      set_active_effect(this.#effect);
      set_active_reaction(this.#effect);
      set_component_context(this.#effect.ctx);
      try {
        Batch.ensure();
        return fn();
      } catch (e) {
        handle_error(e);
        return null;
      } finally {
        set_active_effect(previous_effect);
        set_active_reaction(previous_reaction);
        set_component_context(previous_ctx);
      }
    }
    /**
     * Updates the pending count associated with the currently visible pending snippet,
     * if any, such that we can replace the snippet with content once work is done
     * @param {1 | -1} d
     * @param {Batch} batch
     */
    #update_pending_count(d, batch) {
      if (!this.has_pending_snippet()) {
        if (this.parent) {
          this.parent.#update_pending_count(d, batch);
        }
        return;
      }
      this.#pending_count += d;
      if (this.#pending_count === 0) {
        this.#resolve(batch);
        if (this.#pending_effect) {
          pause_effect(this.#pending_effect, () => {
            this.#pending_effect = null;
          });
        }
        if (this.#offscreen_fragment) {
          this.#anchor.before(this.#offscreen_fragment);
          this.#offscreen_fragment = null;
        }
      }
    }
    /**
     * Update the source that powers `$effect.pending()` inside this boundary,
     * and controls when the current `pending` snippet (if any) is removed.
     * Do not call from inside the class
     * @param {1 | -1} d
     * @param {Batch} batch
     */
    update_pending_count(d, batch) {
      this.#update_pending_count(d, batch);
      this.#local_pending_count += d;
      if (!this.#effect_pending || this.#pending_count_update_queued) return;
      this.#pending_count_update_queued = true;
      queue_micro_task(() => {
        this.#pending_count_update_queued = false;
        if (this.#effect_pending) {
          internal_set(this.#effect_pending, this.#local_pending_count);
        }
      });
    }
    get_effect_pending() {
      this.#effect_pending_subscriber();
      return get(
        /** @type {Source<number>} */
        this.#effect_pending
      );
    }
    /** @param {unknown} error */
    error(error) {
      if (!this.#props.onerror && !this.#props.failed) {
        throw error;
      }
      if (current_batch?.is_fork) {
        if (this.#main_effect) current_batch.skip_effect(this.#main_effect);
        if (this.#pending_effect) current_batch.skip_effect(this.#pending_effect);
        if (this.#failed_effect) current_batch.skip_effect(this.#failed_effect);
        current_batch.oncommit(() => {
          this.#handle_error(error);
        });
      } else {
        this.#handle_error(error);
      }
    }
    /**
     * @param {unknown} error
     */
    #handle_error(error) {
      if (this.#main_effect) {
        destroy_effect(this.#main_effect);
        this.#main_effect = null;
      }
      if (this.#pending_effect) {
        destroy_effect(this.#pending_effect);
        this.#pending_effect = null;
      }
      if (this.#failed_effect) {
        destroy_effect(this.#failed_effect);
        this.#failed_effect = null;
      }
      let failed = this.#props.failed;
      const handle_error_result = (transformed_error) => {
        const { reset, invoke_onerror } = this.#create_reset(transformed_error);
        invoke_onerror();
        if (failed) {
          this.#failed_effect = this.#run(() => {
            try {
              return branch(() => {
                var effect = (
                  /** @type {Effect} */
                  active_effect
                );
                effect.b = this;
                effect.f |= BOUNDARY_EFFECT;
                failed(
                  this.#anchor,
                  () => transformed_error,
                  () => reset
                );
              });
            } catch (error2) {
              invoke_error_boundary(
                error2,
                /** @type {Effect} */
                this.#effect.parent
              );
              return null;
            }
          });
        }
      };
      queue_micro_task(() => {
        var result;
        try {
          result = this.transform_error(error);
        } catch (e) {
          invoke_error_boundary(e, this.#effect && this.#effect.parent);
          return;
        }
        if (result !== null && typeof result === "object" && typeof /** @type {any} */
        result.then === "function") {
          result.then(
            handle_error_result,
            /** @param {unknown} e */
            (e) => invoke_error_boundary(e, this.#effect && this.#effect.parent)
          );
        } else {
          handle_error_result(result);
        }
      });
    }
  }
  function flatten(blockers, sync, async, fn) {
    const d = derived;
    var pending = blockers.filter((b) => !b.settled);
    var deriveds = sync.map(d);
    if (async.length === 0 && pending.length === 0) {
      fn(deriveds);
      return;
    }
    var parent = (
      /** @type {Effect} */
      active_effect
    );
    var restore = capture();
    var blocker_promise = pending.length === 1 ? pending[0].promise : pending.length > 1 ? Promise.all(pending.map((b) => b.promise)) : null;
    function finish(async2) {
      if ((parent.f & DESTROYED) !== 0) {
        return;
      }
      restore();
      try {
        fn([...deriveds, ...async2]);
      } catch (error) {
        invoke_error_boundary(error, parent);
      }
      unset_context();
    }
    var decrement_pending = increment_pending();
    if (async.length === 0) {
      blocker_promise.then(() => finish([])).finally(decrement_pending);
      return;
    }
    function run() {
      Promise.all(async.map((expression) => /* @__PURE__ */ async_derived(expression))).then(finish).catch((error) => invoke_error_boundary(error, parent)).finally(decrement_pending);
    }
    if (blocker_promise) {
      blocker_promise.then(() => {
        restore();
        run();
        unset_context();
      });
    } else {
      run();
    }
  }
  function capture() {
    var previous_effect = (
      /** @type {Effect} */
      active_effect
    );
    var previous_reaction = active_reaction;
    var previous_component_context = component_context;
    var previous_batch2 = (
      /** @type {Batch} */
      current_batch
    );
    return function restore(activate_batch = true) {
      set_active_effect(previous_effect);
      set_active_reaction(previous_reaction);
      set_component_context(previous_component_context);
      if (activate_batch && (previous_effect.f & DESTROYED) === 0) {
        previous_batch2?.activate();
        previous_batch2?.apply();
      }
    };
  }
  function unset_context(deactivate_batch = true) {
    set_active_effect(null);
    set_active_reaction(null);
    set_component_context(null);
    if (deactivate_batch) current_batch?.deactivate();
  }
  function increment_pending() {
    var effect = (
      /** @type {Effect} */
      active_effect
    );
    var boundary2 = effect.b;
    var batch = (
      /** @type {Batch} */
      current_batch
    );
    var blocking = !!boundary2?.is_rendered();
    boundary2?.update_pending_count(1, batch);
    batch.increment(blocking, effect);
    return () => {
      boundary2?.update_pending_count(-1, batch);
      batch.decrement(blocking, effect);
    };
  }
  // @__NO_SIDE_EFFECTS__
  function derived(fn) {
    var flags2 = DERIVED | DIRTY;
    if (active_effect !== null) {
      active_effect.f |= EFFECT_PRESERVED;
    }
    const signal = {
      ctx: component_context,
      deps: null,
      effects: null,
      equals,
      f: flags2,
      fn,
      reactions: null,
      rv: 0,
      v: (
        /** @type {V} */
        UNINITIALIZED
      ),
      wv: 0,
      parent: active_effect,
      ac: null
    };
    return signal;
  }
  const OBSOLETE = /* @__PURE__ */ Symbol("obsolete");
  // @__NO_SIDE_EFFECTS__
  function async_derived(fn, label, location) {
    let parent = (
      /** @type {Effect | null} */
      active_effect
    );
    if (parent === null) {
      async_derived_orphan();
    }
    var promise = (
      /** @type {Promise<V>} */
      /** @type {unknown} */
      void 0
    );
    var signal = source(
      /** @type {V} */
      UNINITIALIZED
    );
    var should_suspend = !active_reaction;
    var deferreds = /* @__PURE__ */ new Set();
    async_effect(() => {
      var effect = (
        /** @type {Effect} */
        active_effect
      );
      var d = deferred();
      promise = d.promise;
      try {
        Promise.resolve(fn()).then(d.resolve, (e) => {
          if (e !== STALE_REACTION) d.reject(e);
        }).finally(unset_context);
      } catch (error) {
        d.reject(error);
        unset_context();
      }
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      if (should_suspend) {
        if ((effect.f & REACTION_RAN) !== 0) {
          var decrement_pending = increment_pending();
        }
        if (
          // boundary can be null if the async derived is inside an $effect.root not connected to the component render tree
          parent.b?.is_rendered()
        ) {
          batch.async_deriveds.get(effect)?.reject(OBSOLETE);
        } else {
          for (const d2 of deferreds.values()) {
            d2.reject(OBSOLETE);
          }
        }
        deferreds.add(d);
        batch.async_deriveds.set(effect, d);
      }
      const handler = (value, error = void 0) => {
        decrement_pending?.();
        deferreds.delete(d);
        if (error === OBSOLETE) return;
        batch.activate();
        if (error) {
          signal.f |= ERROR_VALUE;
          internal_set(signal, error);
        } else {
          if ((signal.f & ERROR_VALUE) !== 0) {
            signal.f ^= ERROR_VALUE;
          }
          internal_set(signal, value);
        }
        batch.deactivate();
      };
      d.promise.then(handler, (e) => handler(null, e || "unknown"));
    });
    teardown(() => {
      for (const d of deferreds) {
        d.reject(OBSOLETE);
      }
    });
    return new Promise((fulfil) => {
      function next(p) {
        function go() {
          if (p === promise) {
            fulfil(signal);
          } else {
            next(promise);
          }
        }
        p.then(go, go);
      }
      next(promise);
    });
  }
  // @__NO_SIDE_EFFECTS__
  function user_derived(fn) {
    const d = /* @__PURE__ */ derived(fn);
    push_reaction_value(d);
    return d;
  }
  // @__NO_SIDE_EFFECTS__
  function derived_safe_equal(fn) {
    const signal = /* @__PURE__ */ derived(fn);
    signal.equals = safe_equals;
    return signal;
  }
  function destroy_derived_effects(derived2) {
    var effects = derived2.effects;
    if (effects !== null) {
      derived2.effects = null;
      for (var i = 0; i < effects.length; i += 1) {
        destroy_effect(
          /** @type {Effect} */
          effects[i]
        );
      }
    }
  }
  function execute_derived(derived2) {
    var value;
    var prev_active_effect = active_effect;
    var parent = derived2.parent;
    if (!is_destroying_effect && parent !== null && derived2.v !== UNINITIALIZED && // if it was never evaluated before, it's guaranteed to fail downstream, so we try to execute instead
    (parent.f & (DESTROYED | INERT)) !== 0) {
      derived_inert();
      return derived2.v;
    }
    set_active_effect(parent);
    {
      try {
        derived2.f &= ~WAS_MARKED;
        destroy_derived_effects(derived2);
        value = update_reaction(derived2);
      } finally {
        set_active_effect(prev_active_effect);
      }
    }
    return value;
  }
  function update_derived(derived2) {
    var value = execute_derived(derived2);
    if (!derived2.equals(value)) {
      derived2.wv = increment_write_version();
      if (!current_batch?.is_fork || derived2.deps === null) {
        if (current_batch !== null) {
          current_batch.capture(derived2, value, true);
          previous_batch?.capture(derived2, value, true);
        } else {
          derived2.v = value;
        }
        if (derived2.deps === null) {
          set_signal_status(derived2, CLEAN);
          return;
        }
      }
    }
    if (is_destroying_effect) {
      return;
    }
    if (batch_values !== null) {
      if (effect_tracking() || current_batch?.is_fork) {
        batch_values.set(derived2, value);
      }
    } else {
      update_derived_status(derived2);
    }
  }
  function freeze_derived_effects(derived2) {
    if (derived2.effects === null) return;
    for (const e of derived2.effects) {
      if (e.teardown || e.ac) {
        e.teardown?.();
        if (e.ac !== null) {
          without_reactive_context(() => {
            e.ac.abort(STALE_REACTION);
            e.ac = null;
          });
        }
        if (e.fn !== null) e.teardown = noop;
        remove_reactions(e, 0);
        destroy_effect_children(e);
      }
    }
  }
  function unfreeze_derived_effects(derived2) {
    if (derived2.effects === null) return;
    for (const e of derived2.effects) {
      if (e.teardown && e.fn !== null) {
        update_effect(e);
      }
    }
  }
  let first_batch = null;
  let last_batch = null;
  let current_batch = null;
  let previous_batch = null;
  let batch_values = null;
  let last_scheduled_effect = null;
  let is_processing = false;
  let collected_effects = null;
  let legacy_updates = null;
  var flush_count = 0;
  var source_stacks = /* @__PURE__ */ new Set();
  let uid = 1;
  class Batch {
    id = uid++;
    /** True as soon as `#process` was called */
    #started = false;
    linked = true;
    /** @type {Batch | null} */
    #prev = null;
    /** @type {Batch | null} */
    #next = null;
    /** @type {Map<Effect, ReturnType<typeof deferred<any>>>} */
    async_deriveds = /* @__PURE__ */ new Map();
    /**
     * The current values of any signals that are updated in this batch.
     * Tuple format: [value, is_derived] (note: is_derived is false for deriveds, too, if they were overridden via assignment)
     * They keys of this map are identical to `this.#previous`
     * @type {Map<Value, [any, boolean]>}
     */
    current = /* @__PURE__ */ new Map();
    /**
     * The values of any signals (sources and deriveds) that are updated in this batch _before_ those updates took place.
     * They keys of this map are identical to `this.#current`
     * @type {Map<Value, any>}
     */
    previous = /* @__PURE__ */ new Map();
    /**
     * When the batch is committed (and the DOM is updated), we need to remove old branches
     * and append new ones by calling the functions added inside (if/each/key/etc) blocks
     * @type {Set<(batch: Batch) => void>}
     */
    #commit_callbacks = /* @__PURE__ */ new Set();
    /**
     * If a fork is discarded, we need to destroy any effects that are no longer needed
     * @type {Set<(batch: Batch) => void>}
     */
    #discard_callbacks = /* @__PURE__ */ new Set();
    /**
     * The number of async effects that are currently in flight
     */
    #pending = 0;
    /**
     * Async effects that are currently in flight, _not_ inside a pending boundary
     * @type {Map<Effect, number>}
     */
    #blocking_pending = /* @__PURE__ */ new Map();
    /**
     * A deferred that resolves when the batch is committed, used with `settled()`
     * TODO replace with Promise.withResolvers once supported widely enough
     * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
     */
    #deferred = null;
    /**
     * The root effects that need to be flushed
     * @type {Effect[]}
     */
    #roots = [];
    /**
     * Effects created while this batch was active.
     * @type {Effect[]}
     */
    #new_effects = [];
    /**
     * Deferred effects (which run after async work has completed) that are DIRTY
     * @type {Set<Effect>}
     */
    #dirty_effects = /* @__PURE__ */ new Set();
    /**
     * Deferred effects that are MAYBE_DIRTY
     * @type {Set<Effect>}
     */
    #maybe_dirty_effects = /* @__PURE__ */ new Set();
    /**
     * A map of branches that still exist, but will be destroyed when this batch
     * is committed — we skip over these during `process`.
     * The value contains child effects that were dirty/maybe_dirty before being reset,
     * so they can be rescheduled if the branch survives.
     * @type {Map<Effect, { d: Effect[], m: Effect[] }>}
     */
    #skipped_branches = /* @__PURE__ */ new Map();
    /**
     * Inverse of #skipped_branches which we need to tell prior batches to unskip them when committing
     * @type {Set<Effect>}
     */
    #unskipped_branches = /* @__PURE__ */ new Set();
    is_fork = false;
    #decrement_queued = false;
    constructor() {
      if (last_batch === null) {
        first_batch = last_batch = this;
      } else {
        last_batch.#next = this;
        this.#prev = last_batch;
      }
      last_batch = this;
    }
    #is_deferred() {
      if (this.is_fork) return true;
      for (const effect of this.#blocking_pending.keys()) {
        var e = effect;
        var skipped = false;
        while (e.parent !== null) {
          if (this.#skipped_branches.has(e)) {
            skipped = true;
            break;
          }
          e = e.parent;
        }
        if (!skipped) {
          return true;
        }
      }
      return false;
    }
    /**
     * Add an effect to the #skipped_branches map and reset its children
     * @param {Effect} effect
     */
    skip_effect(effect) {
      if (!this.#skipped_branches.has(effect)) {
        this.#skipped_branches.set(effect, { d: [], m: [] });
      }
      this.#unskipped_branches.delete(effect);
    }
    /**
     * Remove an effect from the #skipped_branches map and reschedule
     * any tracked dirty/maybe_dirty child effects
     * @param {Effect} effect
     * @param {(e: Effect) => void} callback
     */
    unskip_effect(effect, callback = (e) => this.schedule(e)) {
      var tracked = this.#skipped_branches.get(effect);
      if (tracked) {
        this.#skipped_branches.delete(effect);
        for (var e of tracked.d) {
          set_signal_status(e, DIRTY);
          callback(e);
        }
        for (e of tracked.m) {
          set_signal_status(e, MAYBE_DIRTY);
          callback(e);
        }
      }
      this.#unskipped_branches.add(effect);
    }
    #process() {
      this.#started = true;
      if (flush_count++ > 1e3) {
        this.#unlink();
        infinite_loop_guard();
      }
      for (const e of this.#dirty_effects) {
        this.#maybe_dirty_effects.delete(e);
        set_signal_status(e, DIRTY);
        this.schedule(e);
      }
      for (const e of this.#maybe_dirty_effects) {
        set_signal_status(e, MAYBE_DIRTY);
        this.schedule(e);
      }
      const roots = this.#roots;
      this.#roots = [];
      this.apply();
      var effects = collected_effects = [];
      var render_effects = [];
      var updates = legacy_updates = [];
      for (const root2 of roots) {
        try {
          this.#traverse(root2, effects, render_effects);
        } catch (e) {
          reset_all(root2);
          if (!this.#is_deferred()) this.discard();
          throw e;
        }
      }
      current_batch = null;
      if (updates.length > 0) {
        var batch = Batch.ensure();
        for (const e of updates) {
          batch.schedule(e);
        }
      }
      collected_effects = null;
      legacy_updates = null;
      if (this.#is_deferred()) {
        this.#defer_effects(render_effects);
        this.#defer_effects(effects);
        for (const [e, t] of this.#skipped_branches) {
          reset_branch(e, t);
        }
        if (updates.length > 0) {
          /** @type {unknown} */
          current_batch.#process();
        }
        return;
      }
      const earlier_batch = this.#find_earlier_batch();
      if (earlier_batch) {
        this.#defer_effects(render_effects);
        this.#defer_effects(effects);
        earlier_batch.#merge(this);
        return;
      }
      this.#dirty_effects.clear();
      this.#maybe_dirty_effects.clear();
      for (const fn of this.#commit_callbacks) fn(this);
      this.#commit_callbacks.clear();
      previous_batch = this;
      flush_queued_effects(render_effects);
      flush_queued_effects(effects);
      previous_batch = null;
      this.#deferred?.resolve();
      var next_batch = (
        /** @type {Batch | null} */
        /** @type {unknown} */
        current_batch
      );
      if (this.#pending === 0 && (this.#roots.length === 0 || next_batch !== null)) {
        this.#unlink();
      }
      if (this.#roots.length > 0) {
        if (next_batch !== null) {
          const batch2 = next_batch;
          batch2.#roots.push(...this.#roots.filter((r) => !batch2.#roots.includes(r)));
        } else {
          next_batch = this;
        }
      }
      if (next_batch !== null) {
        old_values.clear();
        next_batch.#process();
      }
    }
    /**
     * Traverse the effect tree, executing effects or stashing
     * them for later execution as appropriate
     * @param {Effect} root
     * @param {Effect[]} effects
     * @param {Effect[]} render_effects
     */
    #traverse(root2, effects, render_effects) {
      root2.f ^= CLEAN;
      var effect = root2.first;
      while (effect !== null) {
        var flags2 = effect.f;
        var is_branch = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
        var is_skippable_branch = is_branch && (flags2 & CLEAN) !== 0;
        var skip = is_skippable_branch || (flags2 & INERT) !== 0 || this.#skipped_branches.has(effect);
        if (!skip && effect.fn !== null) {
          if (is_branch) {
            effect.f ^= CLEAN;
          } else if ((flags2 & EFFECT) !== 0) {
            effects.push(effect);
          } else if (is_dirty(effect)) {
            if ((flags2 & BLOCK_EFFECT) !== 0) this.#maybe_dirty_effects.add(effect);
            update_effect(effect);
          }
          var child2 = effect.first;
          if (child2 !== null) {
            effect = child2;
            continue;
          }
        }
        while (effect !== null) {
          var next = effect.next;
          if (next !== null) {
            effect = next;
            break;
          }
          effect = effect.parent;
        }
      }
    }
    #find_earlier_batch() {
      var batch = this.#prev;
      while (batch !== null) {
        if (!batch.is_fork) {
          for (const [value, [, is_derived]] of this.current) {
            if (batch.current.has(value) && !is_derived) {
              return batch;
            }
          }
        }
        batch = batch.#prev;
      }
      return null;
    }
    /**
     * @param {Batch} batch
     */
    #merge(batch) {
      for (const [source2, value] of batch.current) {
        if (!this.previous.has(source2) && batch.previous.has(source2)) {
          this.previous.set(source2, batch.previous.get(source2));
        }
        this.current.set(source2, value);
      }
      for (const [effect, deferred2] of batch.async_deriveds) {
        const d = this.async_deriveds.get(effect);
        if (d) deferred2.promise.then(d.resolve).catch(d.reject);
      }
      batch.async_deriveds.clear();
      this.transfer_effects(batch.#dirty_effects, batch.#maybe_dirty_effects);
      const mark = (value) => {
        var reactions = value.reactions;
        if (reactions === null) return;
        if ((value.f & DERIVED) !== 0 && (value.f & (DIRTY | MAYBE_DIRTY)) === 0) {
          return;
        }
        for (const reaction of reactions) {
          var flags2 = reaction.f;
          if ((flags2 & DERIVED) !== 0) {
            mark(
              /** @type {Derived} */
              reaction
            );
          } else {
            var effect = (
              /** @type {Effect} */
              reaction
            );
            if (flags2 & (ASYNC | BLOCK_EFFECT) && !this.async_deriveds.has(effect)) {
              this.#maybe_dirty_effects.delete(effect);
              set_signal_status(effect, DIRTY);
              this.schedule(effect);
            }
          }
        }
      };
      for (const source2 of this.current.keys()) {
        mark(source2);
      }
      this.oncommit(() => batch.discard());
      batch.#unlink();
      current_batch = this;
      this.#process();
    }
    /**
     * @param {Effect[]} effects
     */
    #defer_effects(effects) {
      for (var i = 0; i < effects.length; i += 1) {
        defer_effect(effects[i], this.#dirty_effects, this.#maybe_dirty_effects);
      }
    }
    /**
     * Associate a change to a given source with the current
     * batch, noting its previous and current values
     * @param {Value} source
     * @param {any} value
     * @param {boolean} [is_derived]
     */
    capture(source2, value, is_derived = false) {
      if (source2.v !== UNINITIALIZED && !this.previous.has(source2)) {
        this.previous.set(source2, source2.v);
      }
      if ((source2.f & ERROR_VALUE) === 0) {
        this.current.set(source2, [value, is_derived]);
        batch_values?.set(source2, value);
      }
      if (!this.is_fork) {
        source2.v = value;
      }
    }
    activate() {
      current_batch = this;
    }
    deactivate() {
      current_batch = null;
      batch_values = null;
    }
    flush() {
      try {
        if (DEV) ;
        is_processing = true;
        current_batch = this;
        this.#process();
      } finally {
        flush_count = 0;
        last_scheduled_effect = null;
        collected_effects = null;
        legacy_updates = null;
        is_processing = false;
        current_batch = null;
        batch_values = null;
        old_values.clear();
      }
    }
    discard() {
      for (const fn of this.#discard_callbacks) fn(this);
      this.#discard_callbacks.clear();
      for (const deferred2 of this.async_deriveds.values()) {
        deferred2.reject(OBSOLETE);
      }
      this.#unlink();
      this.#deferred?.resolve();
    }
    /**
     * @param {Effect} effect
     */
    register_created_effect(effect) {
      this.#new_effects.push(effect);
    }
    #commit() {
      for (let batch = first_batch; batch !== null; batch = batch.#next) {
        var is_earlier = batch.id < this.id;
        var sources = [];
        for (const [source3, [value, is_derived]] of this.current) {
          if (batch.current.has(source3)) {
            var batch_value = (
              /** @type {[any, boolean]} */
              batch.current.get(source3)[0]
            );
            if (is_earlier && value !== batch_value) {
              batch.current.set(source3, [value, is_derived]);
            } else {
              continue;
            }
          }
          sources.push(source3);
        }
        if (is_earlier) {
          for (const [effect, deferred2] of this.async_deriveds) {
            const d = batch.async_deriveds.get(effect);
            if (d) deferred2.promise.then(d.resolve).catch(d.reject);
          }
        }
        var current = [...batch.current.keys()].filter(
          (source3) => !/** @type {[any, boolean]} */
          batch.current.get(source3)[1]
        );
        if (!batch.#started || current.length === 0) continue;
        var others = current.filter((source3) => !this.current.has(source3));
        if (others.length === 0) {
          if (is_earlier) {
            batch.discard();
          }
        } else if (sources.length > 0) {
          if (is_earlier) {
            for (const unskipped of this.#unskipped_branches) {
              batch.unskip_effect(unskipped, (e) => {
                if ((e.f & (BLOCK_EFFECT | ASYNC)) !== 0) {
                  batch.schedule(e);
                } else {
                  batch.#defer_effects([e]);
                }
              });
            }
          }
          batch.activate();
          var marked = /* @__PURE__ */ new Set();
          var checked = /* @__PURE__ */ new Map();
          for (var source2 of sources) {
            mark_effects(source2, others, marked, checked);
          }
          checked = /* @__PURE__ */ new Map();
          var current_unequal = [...batch.current].filter(([c, v1]) => {
            const v2 = this.current.get(c);
            if (!v2) return true;
            return v2[0] !== v1[0] || v2[1] !== v1[1];
          }).map(([c]) => c);
          if (current_unequal.length > 0) {
            for (const effect of this.#new_effects) {
              if ((effect.f & (DESTROYED | INERT | EAGER_EFFECT)) === 0 && depends_on(effect, current_unequal, checked)) {
                if ((effect.f & (ASYNC | BLOCK_EFFECT)) !== 0) {
                  set_signal_status(effect, DIRTY);
                  batch.schedule(effect);
                } else {
                  batch.#dirty_effects.add(effect);
                }
              }
            }
          }
          if (batch.#roots.length > 0 && !batch.#decrement_queued) {
            batch.apply();
            for (var root2 of batch.#roots) {
              batch.#traverse(root2, [], []);
            }
            batch.#roots = [];
          }
          batch.deactivate();
        }
      }
    }
    /**
     * @param {boolean} blocking
     * @param {Effect} effect
     */
    increment(blocking, effect) {
      this.#pending += 1;
      if (blocking) {
        let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
        this.#blocking_pending.set(effect, blocking_pending_count + 1);
      }
    }
    /**
     * @param {boolean} blocking
     * @param {Effect} effect
     */
    decrement(blocking, effect) {
      this.#pending -= 1;
      if (blocking) {
        let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
        if (blocking_pending_count === 1) {
          this.#blocking_pending.delete(effect);
        } else {
          this.#blocking_pending.set(effect, blocking_pending_count - 1);
        }
      }
      if (this.#decrement_queued) return;
      this.#decrement_queued = true;
      queue_micro_task(() => {
        this.#decrement_queued = false;
        if (this.linked) {
          this.flush();
        }
      });
    }
    /**
     * @param {Set<Effect>} dirty_effects
     * @param {Set<Effect>} maybe_dirty_effects
     */
    transfer_effects(dirty_effects, maybe_dirty_effects) {
      for (const e of dirty_effects) {
        this.#dirty_effects.add(e);
      }
      for (const e of maybe_dirty_effects) {
        this.#maybe_dirty_effects.add(e);
      }
      dirty_effects.clear();
      maybe_dirty_effects.clear();
    }
    /** @param {(batch: Batch) => void} fn */
    oncommit(fn) {
      this.#commit_callbacks.add(fn);
    }
    /** @param {(batch: Batch) => void} fn */
    ondiscard(fn) {
      this.#discard_callbacks.add(fn);
    }
    settled() {
      return (this.#deferred ??= deferred()).promise;
    }
    static ensure() {
      if (current_batch === null) {
        const batch = current_batch = new Batch();
        if (!is_processing && true) {
          queue_micro_task(() => {
            if (!batch.#started) {
              batch.flush();
            }
          });
        }
      }
      return current_batch;
    }
    apply() {
      {
        batch_values = null;
        return;
      }
    }
    /**
     *
     * @param {Effect} effect
     */
    schedule(effect) {
      last_scheduled_effect = effect;
      if (effect.b?.is_pending && (effect.f & (EFFECT | RENDER_EFFECT | MANAGED_EFFECT)) !== 0 && (effect.f & REACTION_RAN) === 0) {
        effect.b.defer_effect(effect);
        return;
      }
      var e = effect;
      while (e.parent !== null) {
        e = e.parent;
        var flags2 = e.f;
        if (collected_effects !== null && e === active_effect) {
          if ((active_reaction === null || (active_reaction.f & DERIVED) === 0) && true) {
            return;
          }
        }
        if ((flags2 & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
          if ((flags2 & CLEAN) === 0) {
            return;
          }
          e.f ^= CLEAN;
        }
      }
      this.#roots.push(e);
    }
    #unlink() {
      if (!this.linked) return;
      var prev = this.#prev;
      var next = this.#next;
      if (prev === null) {
        first_batch = next;
      } else {
        prev.#next = next;
      }
      if (next === null) {
        last_batch = prev;
      } else {
        next.#prev = prev;
      }
      this.linked = false;
    }
  }
  function infinite_loop_guard() {
    try {
      effect_update_depth_exceeded();
    } catch (error) {
      invoke_error_boundary(error, last_scheduled_effect);
    }
  }
  let eager_block_effects = null;
  function flush_queued_effects(effects) {
    var length = effects.length;
    if (length === 0) return;
    var i = 0;
    while (i < length) {
      var effect = effects[i++];
      if ((effect.f & (DESTROYED | INERT)) === 0 && is_dirty(effect)) {
        eager_block_effects = /* @__PURE__ */ new Set();
        update_effect(effect);
        if (effect.deps === null && effect.first === null && effect.nodes === null && effect.teardown === null && effect.ac === null) {
          unlink_effect(effect);
        }
        if (eager_block_effects?.size > 0) {
          old_values.clear();
          for (const e of eager_block_effects) {
            if ((e.f & (DESTROYED | INERT)) !== 0) continue;
            const ordered_effects = [e];
            let ancestor = e.parent;
            while (ancestor !== null) {
              if (eager_block_effects.has(ancestor)) {
                eager_block_effects.delete(ancestor);
                ordered_effects.push(ancestor);
              }
              ancestor = ancestor.parent;
            }
            for (let j = ordered_effects.length - 1; j >= 0; j--) {
              const e2 = ordered_effects[j];
              if ((e2.f & (DESTROYED | INERT)) !== 0) continue;
              update_effect(e2);
            }
          }
          eager_block_effects.clear();
        }
      }
    }
    eager_block_effects = null;
  }
  function mark_effects(value, sources, marked, checked) {
    if (marked.has(value)) return;
    marked.add(value);
    if (value.reactions !== null) {
      for (const reaction of value.reactions) {
        const flags2 = reaction.f;
        if ((flags2 & DERIVED) !== 0) {
          mark_effects(
            /** @type {Derived} */
            reaction,
            sources,
            marked,
            checked
          );
        } else if ((flags2 & (ASYNC | BLOCK_EFFECT)) !== 0 && (flags2 & DIRTY) === 0 && depends_on(reaction, sources, checked)) {
          set_signal_status(reaction, DIRTY);
          schedule_effect(
            /** @type {Effect} */
            reaction
          );
        }
      }
    }
  }
  function depends_on(reaction, sources, checked) {
    const depends = checked.get(reaction);
    if (depends !== void 0) return depends;
    if (reaction.deps !== null) {
      for (const dep of reaction.deps) {
        if (includes.call(sources, dep)) {
          return true;
        }
        if ((dep.f & DERIVED) !== 0 && depends_on(
          /** @type {Derived} */
          dep,
          sources,
          checked
        )) {
          checked.set(
            /** @type {Derived} */
            dep,
            true
          );
          return true;
        }
      }
    }
    checked.set(reaction, false);
    return false;
  }
  function schedule_effect(effect) {
    current_batch.schedule(effect);
  }
  function reset_branch(effect, tracked) {
    if ((effect.f & BRANCH_EFFECT) !== 0 && (effect.f & CLEAN) !== 0) {
      return;
    }
    if ((effect.f & DIRTY) !== 0) {
      tracked.d.push(effect);
    } else if ((effect.f & MAYBE_DIRTY) !== 0) {
      tracked.m.push(effect);
    }
    set_signal_status(effect, CLEAN);
    var e = effect.first;
    while (e !== null) {
      reset_branch(e, tracked);
      e = e.next;
    }
  }
  function reset_all(effect) {
    set_signal_status(effect, CLEAN);
    var e = effect.first;
    while (e !== null) {
      reset_all(e);
      e = e.next;
    }
  }
  let eager_effects = /* @__PURE__ */ new Set();
  const old_values = /* @__PURE__ */ new Map();
  let eager_effects_deferred = false;
  function source(v, stack) {
    var signal = {
      f: 0,
      // TODO ideally we could skip this altogether, but it causes type errors
      v,
      reactions: null,
      equals,
      rv: 0,
      wv: 0
    };
    return signal;
  }
  // @__NO_SIDE_EFFECTS__
  function state(v, stack) {
    const s = source(v);
    push_reaction_value(s);
    return s;
  }
  // @__NO_SIDE_EFFECTS__
  function mutable_source(initial_value, immutable = false, trackable = true) {
    const s = source(initial_value);
    if (!immutable) {
      s.equals = safe_equals;
    }
    return s;
  }
  function set(source2, value, should_proxy = false) {
    if (active_reaction !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
    // to ensure we error if state is set inside an inspect effect
    (!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) && is_runes() && (active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 && (current_sources === null || !current_sources.has(source2))) {
      state_unsafe_mutation();
    }
    let new_value = should_proxy ? proxy(value) : value;
    return internal_set(source2, new_value, legacy_updates);
  }
  function internal_set(source2, value, updated_during_traversal = null) {
    if (!source2.equals(value)) {
      if (is_destroying_effect) {
        old_values.set(source2, value);
      } else if (!old_values.has(source2)) {
        old_values.set(source2, source2.v);
      }
      var batch = Batch.ensure();
      batch.capture(source2, value);
      if ((source2.f & DERIVED) !== 0) {
        const derived2 = (
          /** @type {Derived} */
          source2
        );
        if ((source2.f & DIRTY) !== 0) {
          execute_derived(derived2);
        }
        if (batch_values === null) {
          update_derived_status(derived2);
        }
      }
      source2.wv = increment_write_version();
      mark_reactions(source2, DIRTY, updated_during_traversal);
      if (active_effect !== null && (active_effect.f & CLEAN) !== 0 && (active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0) {
        if (untracked_writes === null) {
          set_untracked_writes([source2]);
        } else {
          untracked_writes.push(source2);
        }
      }
      if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
        flush_eager_effects();
      }
    }
    return value;
  }
  function flush_eager_effects() {
    eager_effects_deferred = false;
    for (const effect of eager_effects) {
      if ((effect.f & CLEAN) !== 0) {
        set_signal_status(effect, MAYBE_DIRTY);
      }
      let dirty;
      try {
        dirty = is_dirty(effect);
      } catch {
        dirty = true;
      }
      if (dirty) {
        update_effect(effect);
      }
    }
    eager_effects.clear();
  }
  function update(source2, d = 1) {
    var value = get(source2);
    var result = d === 1 ? value++ : value--;
    set(source2, value);
    return result;
  }
  function increment(source2) {
    set(source2, source2.v + 1);
  }
  function mark_reactions(signal, status, updated_during_traversal) {
    var reactions = signal.reactions;
    if (reactions === null) return;
    var length = reactions.length;
    for (var i = 0; i < length; i++) {
      var reaction = reactions[i];
      var flags2 = reaction.f;
      var not_dirty = (flags2 & DIRTY) === 0;
      if (not_dirty) {
        set_signal_status(reaction, status);
      }
      if ((flags2 & EAGER_EFFECT) !== 0) {
        eager_effects.add(
          /** @type {Effect} */
          reaction
        );
      } else if ((flags2 & DERIVED) !== 0) {
        var derived2 = (
          /** @type {Derived} */
          reaction
        );
        batch_values?.delete(derived2);
        if ((flags2 & WAS_MARKED) === 0) {
          if (flags2 & CONNECTED && (active_effect === null || (active_effect.f & REACTION_IS_UPDATING) === 0)) {
            reaction.f |= WAS_MARKED;
          }
          mark_reactions(derived2, MAYBE_DIRTY, updated_during_traversal);
        }
      } else if (not_dirty) {
        var effect = (
          /** @type {Effect} */
          reaction
        );
        if ((flags2 & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
          eager_block_effects.add(effect);
        }
        if (updated_during_traversal !== null) {
          updated_during_traversal.push(effect);
        } else {
          schedule_effect(effect);
        }
      }
    }
  }
  function proxy(value) {
    if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
      return value;
    }
    const prototype = get_prototype_of(value);
    if (prototype !== object_prototype && prototype !== array_prototype) {
      return value;
    }
    var sources = /* @__PURE__ */ new Map();
    var is_proxied_array = is_array(value);
    var version = /* @__PURE__ */ state(0);
    var parent_version = update_version;
    var with_parent = (fn) => {
      if (update_version === parent_version) {
        return fn();
      }
      var reaction = active_reaction;
      var version2 = update_version;
      set_active_reaction(null);
      set_update_version(parent_version);
      var result = fn();
      set_active_reaction(reaction);
      set_update_version(version2);
      return result;
    };
    if (is_proxied_array) {
      sources.set("length", /* @__PURE__ */ state(
        /** @type {any[]} */
        value.length
      ));
    }
    return new Proxy(
      /** @type {any} */
      value,
      {
        defineProperty(_, prop, descriptor) {
          if (!("value" in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) {
            state_descriptors_fixed();
          }
          var s = sources.get(prop);
          if (s === void 0) {
            with_parent(() => {
              var s2 = /* @__PURE__ */ state(descriptor.value);
              sources.set(prop, s2);
              return s2;
            });
          } else {
            set(s, descriptor.value, true);
          }
          return true;
        },
        deleteProperty(target2, prop) {
          var s = sources.get(prop);
          if (s === void 0) {
            if (prop in target2) {
              const s2 = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
              sources.set(prop, s2);
              increment(version);
            }
          } else {
            set(s, UNINITIALIZED);
            increment(version);
          }
          return true;
        },
        get(target2, prop, receiver) {
          if (prop === STATE_SYMBOL) {
            return value;
          }
          var s = sources.get(prop);
          var exists = prop in target2;
          if (s === void 0 && (!exists || get_descriptor(target2, prop)?.writable)) {
            s = with_parent(() => {
              var p = proxy(exists ? target2[prop] : UNINITIALIZED);
              var s2 = /* @__PURE__ */ state(p);
              return s2;
            });
            sources.set(prop, s);
          }
          if (s !== void 0) {
            var v = get(s);
            return v === UNINITIALIZED ? void 0 : v;
          }
          return Reflect.get(target2, prop, receiver);
        },
        getOwnPropertyDescriptor(target2, prop) {
          var descriptor = Reflect.getOwnPropertyDescriptor(target2, prop);
          if (descriptor && "value" in descriptor) {
            var s = sources.get(prop);
            if (s) descriptor.value = get(s);
          } else if (descriptor === void 0) {
            var source2 = sources.get(prop);
            var value2 = source2?.v;
            if (source2 !== void 0 && value2 !== UNINITIALIZED) {
              return {
                enumerable: true,
                configurable: true,
                value: value2,
                writable: true
              };
            }
          }
          return descriptor;
        },
        has(target2, prop) {
          if (prop === STATE_SYMBOL) {
            return true;
          }
          var s = sources.get(prop);
          var has = s !== void 0 && s.v !== UNINITIALIZED || Reflect.has(target2, prop);
          if (s !== void 0 || active_effect !== null && (!has || get_descriptor(target2, prop)?.writable)) {
            if (s === void 0) {
              s = with_parent(() => {
                var p = has ? proxy(target2[prop]) : UNINITIALIZED;
                var s2 = /* @__PURE__ */ state(p);
                return s2;
              });
              sources.set(prop, s);
            }
            var value2 = get(s);
            if (value2 === UNINITIALIZED) {
              return false;
            }
          }
          return has;
        },
        set(target2, prop, value2, receiver) {
          var s = sources.get(prop);
          var has = prop in target2;
          if (is_proxied_array && prop === "length") {
            for (var i = value2; i < /** @type {Source<number>} */
            s.v; i += 1) {
              var other_s = sources.get(i + "");
              if (other_s !== void 0) {
                set(other_s, UNINITIALIZED);
              } else if (i in target2) {
                other_s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED));
                sources.set(i + "", other_s);
              }
            }
          }
          if (s === void 0) {
            if (!has || get_descriptor(target2, prop)?.writable) {
              s = with_parent(() => /* @__PURE__ */ state(void 0));
              set(s, proxy(value2));
              sources.set(prop, s);
            }
          } else {
            has = s.v !== UNINITIALIZED;
            var p = with_parent(() => proxy(value2));
            set(s, p);
          }
          var descriptor = Reflect.getOwnPropertyDescriptor(target2, prop);
          if (descriptor?.set) {
            descriptor.set.call(receiver, value2);
          }
          if (!has) {
            if (is_proxied_array && typeof prop === "string") {
              var ls = (
                /** @type {Source<number>} */
                sources.get("length")
              );
              var n = Number(prop);
              if (Number.isInteger(n) && n >= ls.v) {
                set(ls, n + 1);
              }
            }
            increment(version);
          }
          return true;
        },
        ownKeys(target2) {
          get(version);
          var own_keys = Reflect.ownKeys(target2).filter((key2) => {
            var source3 = sources.get(key2);
            return source3 === void 0 || source3.v !== UNINITIALIZED;
          });
          for (var [key, source2] of sources) {
            if (source2.v !== UNINITIALIZED && !(key in target2)) {
              own_keys.push(key);
            }
          }
          return own_keys;
        },
        setPrototypeOf() {
          state_prototype_fixed();
        }
      }
    );
  }
  var $window;
  var is_firefox;
  var first_child_getter;
  var next_sibling_getter;
  function init_operations() {
    if ($window !== void 0) {
      return;
    }
    $window = window;
    is_firefox = /Firefox/.test(navigator.userAgent);
    var element_prototype = Element.prototype;
    var node_prototype = Node.prototype;
    var text_prototype = Text.prototype;
    first_child_getter = get_descriptor(node_prototype, "firstChild").get;
    next_sibling_getter = get_descriptor(node_prototype, "nextSibling").get;
    if (is_extensible(element_prototype)) {
      element_prototype[CLASS_CACHE] = void 0;
      element_prototype[ATTRIBUTES_CACHE] = null;
      element_prototype[STYLE_CACHE] = void 0;
      element_prototype.__e = void 0;
    }
    if (is_extensible(text_prototype)) {
      text_prototype[TEXT_CACHE] = void 0;
    }
  }
  function create_text(value = "") {
    return document.createTextNode(value);
  }
  // @__NO_SIDE_EFFECTS__
  function get_first_child(node) {
    return (
      /** @type {TemplateNode | null} */
      first_child_getter.call(node)
    );
  }
  // @__NO_SIDE_EFFECTS__
  function get_next_sibling(node) {
    return (
      /** @type {TemplateNode | null} */
      next_sibling_getter.call(node)
    );
  }
  function child(node, is_text) {
    {
      return /* @__PURE__ */ get_first_child(node);
    }
  }
  function first_child(node, is_text = false) {
    {
      var first = /* @__PURE__ */ get_first_child(node);
      if (first instanceof Comment && first.data === "") return /* @__PURE__ */ get_next_sibling(first);
      return first;
    }
  }
  function sibling(node, count = 1, is_text = false) {
    let next_sibling = node;
    while (count--) {
      next_sibling = /** @type {TemplateNode} */
      /* @__PURE__ */ get_next_sibling(next_sibling);
    }
    {
      return next_sibling;
    }
  }
  function clear_text_content(node) {
    node.textContent = "";
  }
  function should_defer_append() {
    return false;
  }
  function create_element(tag, namespace, is) {
    {
      return (
        /** @type {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element} */
        is ? document.createElement(tag, { is }) : document.createElement(tag)
      );
    }
  }
  function validate_effect(rune) {
    if (active_effect === null) {
      if (active_reaction === null) {
        effect_orphan();
      }
      effect_in_unowned_derived();
    }
    if (is_destroying_effect) {
      effect_in_teardown();
    }
  }
  function push_effect(effect, parent_effect) {
    var parent_last = parent_effect.last;
    if (parent_last === null) {
      parent_effect.last = parent_effect.first = effect;
    } else {
      parent_last.next = effect;
      effect.prev = parent_last;
      parent_effect.last = effect;
    }
  }
  function create_effect(type, fn) {
    var parent = active_effect;
    if (parent !== null && (parent.f & INERT) !== 0) {
      type |= INERT;
    }
    var effect = {
      ctx: component_context,
      deps: null,
      nodes: null,
      f: type | DIRTY | CONNECTED,
      first: null,
      fn,
      last: null,
      next: null,
      parent,
      b: parent && parent.b,
      prev: null,
      teardown: null,
      wv: 0,
      ac: null
    };
    current_batch?.register_created_effect(effect);
    var e = effect;
    if ((type & EFFECT) !== 0) {
      if (collected_effects !== null) {
        collected_effects.push(effect);
      } else {
        Batch.ensure().schedule(effect);
      }
    } else if (fn !== null) {
      try {
        update_effect(effect);
      } catch (e2) {
        destroy_effect(effect);
        throw e2;
      }
      if (e.deps === null && e.teardown === null && e.nodes === null && e.first === e.last && // either `null`, or a singular child
      (e.f & EFFECT_PRESERVED) === 0) {
        e = e.first;
        if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
          e.f |= EFFECT_TRANSPARENT;
        }
      }
    }
    if (e !== null) {
      e.parent = parent;
      if (parent !== null) {
        push_effect(e, parent);
      }
      if (active_reaction !== null && (active_reaction.f & DERIVED) !== 0 && (type & ROOT_EFFECT) === 0) {
        var derived2 = (
          /** @type {Derived} */
          active_reaction
        );
        (derived2.effects ??= []).push(e);
      }
    }
    return effect;
  }
  function effect_tracking() {
    return active_reaction !== null && !untracking;
  }
  function teardown(fn) {
    const effect = create_effect(RENDER_EFFECT, null);
    set_signal_status(effect, CLEAN);
    effect.teardown = fn;
    return effect;
  }
  function user_effect(fn) {
    validate_effect();
    var flags2 = (
      /** @type {Effect} */
      active_effect.f
    );
    var defer = !active_reaction && (flags2 & BRANCH_EFFECT) !== 0 && component_context !== null && !component_context.i;
    if (defer) {
      var context = (
        /** @type {ComponentContext} */
        component_context
      );
      (context.e ??= []).push(fn);
    } else {
      return create_user_effect(fn);
    }
  }
  function create_user_effect(fn) {
    return create_effect(EFFECT | USER_EFFECT, fn);
  }
  function component_root(fn) {
    Batch.ensure();
    const effect = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn);
    return (options = {}) => {
      return new Promise((fulfil) => {
        if (options.outro) {
          pause_effect(effect, () => {
            destroy_effect(effect);
            fulfil(void 0);
          });
        } else {
          destroy_effect(effect);
          fulfil(void 0);
        }
      });
    };
  }
  function async_effect(fn) {
    return create_effect(ASYNC | EFFECT_PRESERVED, fn);
  }
  function render_effect(fn, flags2 = 0) {
    return create_effect(RENDER_EFFECT | flags2, fn);
  }
  function template_effect(fn, sync = [], async = [], blockers = []) {
    flatten(blockers, sync, async, (values) => {
      create_effect(RENDER_EFFECT, () => {
        fn(...values.map(get));
      });
    });
  }
  function block(fn, flags2 = 0) {
    var effect = create_effect(BLOCK_EFFECT | flags2, fn);
    return effect;
  }
  function branch(fn) {
    return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn);
  }
  function execute_effect_teardown(effect) {
    var teardown2 = effect.teardown;
    if (teardown2 !== null) {
      const previously_destroying_effect = is_destroying_effect;
      const previous_reaction = active_reaction;
      set_is_destroying_effect(true);
      set_active_reaction(null);
      try {
        teardown2.call(null);
      } finally {
        set_is_destroying_effect(previously_destroying_effect);
        set_active_reaction(previous_reaction);
      }
    }
  }
  function destroy_effect_children(signal, remove_dom = false) {
    var effect = signal.first;
    signal.first = signal.last = null;
    while (effect !== null) {
      const controller = effect.ac;
      if (controller !== null) {
        without_reactive_context(() => {
          controller.abort(STALE_REACTION);
        });
      }
      var next = effect.next;
      if ((effect.f & ROOT_EFFECT) !== 0) {
        effect.parent = null;
      } else {
        destroy_effect(effect, remove_dom);
      }
      effect = next;
    }
  }
  function destroy_block_effect_children(signal) {
    var effect = signal.first;
    while (effect !== null) {
      var next = effect.next;
      if ((effect.f & BRANCH_EFFECT) === 0) {
        destroy_effect(effect);
      }
      effect = next;
    }
  }
  function destroy_effect(effect, remove_dom = true) {
    var removed = false;
    if ((remove_dom || (effect.f & HEAD_EFFECT) !== 0) && effect.nodes !== null && effect.nodes.end !== null) {
      remove_effect_dom(
        effect.nodes.start,
        /** @type {TemplateNode} */
        effect.nodes.end
      );
      removed = true;
    }
    effect.f |= DESTROYING;
    destroy_effect_children(effect, remove_dom && !removed);
    remove_reactions(effect, 0);
    var transitions = effect.nodes && effect.nodes.t;
    if (transitions !== null) {
      for (const transition of transitions) {
        transition.stop();
      }
    }
    execute_effect_teardown(effect);
    effect.f ^= DESTROYING;
    effect.f |= DESTROYED;
    var parent = effect.parent;
    if (parent !== null && parent.first !== null) {
      unlink_effect(effect);
    }
    effect.next = effect.prev = effect.teardown = effect.ctx = effect.deps = effect.fn = effect.nodes = effect.ac = effect.b = null;
  }
  function remove_effect_dom(node, end) {
    while (node !== null) {
      var next = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
      node.remove();
      node = next;
    }
  }
  function unlink_effect(effect) {
    var parent = effect.parent;
    var prev = effect.prev;
    var next = effect.next;
    if (prev !== null) prev.next = next;
    if (next !== null) next.prev = prev;
    if (parent !== null) {
      if (parent.first === effect) parent.first = next;
      if (parent.last === effect) parent.last = prev;
    }
  }
  function pause_effect(effect, callback, destroy = true) {
    var transitions = [];
    pause_children(effect, transitions, true);
    var fn = () => {
      if (destroy) destroy_effect(effect);
      if (callback) callback();
    };
    var remaining = transitions.length;
    if (remaining > 0) {
      var check = () => --remaining || fn();
      for (var transition of transitions) {
        transition.out(check);
      }
    } else {
      fn();
    }
  }
  function pause_children(effect, transitions, local) {
    if ((effect.f & INERT) !== 0) return;
    effect.f ^= INERT;
    var t = effect.nodes && effect.nodes.t;
    if (t !== null) {
      for (const transition of t) {
        if (transition.is_global || local) {
          transitions.push(transition);
        }
      }
    }
    var child2 = effect.first;
    while (child2 !== null) {
      var sibling2 = child2.next;
      if ((child2.f & ROOT_EFFECT) === 0) {
        var transparent = (child2.f & EFFECT_TRANSPARENT) !== 0 || // If this is a branch effect without a block effect parent,
        // it means the parent block effect was pruned. In that case,
        // transparency information was transferred to the branch effect.
        (child2.f & BRANCH_EFFECT) !== 0 && (effect.f & BLOCK_EFFECT) !== 0;
        pause_children(child2, transitions, transparent ? local : false);
      }
      child2 = sibling2;
    }
  }
  function resume_effect(effect) {
    resume_children(effect, true);
  }
  function resume_children(effect, local) {
    if ((effect.f & INERT) === 0) return;
    effect.f ^= INERT;
    if ((effect.f & CLEAN) === 0) {
      set_signal_status(effect, DIRTY);
      Batch.ensure().schedule(effect);
    }
    var child2 = effect.first;
    while (child2 !== null) {
      var sibling2 = child2.next;
      var transparent = (child2.f & EFFECT_TRANSPARENT) !== 0 || (child2.f & BRANCH_EFFECT) !== 0;
      resume_children(child2, transparent ? local : false);
      child2 = sibling2;
    }
    var t = effect.nodes && effect.nodes.t;
    if (t !== null) {
      for (const transition of t) {
        if (transition.is_global || local) {
          transition.in();
        }
      }
    }
  }
  function move_effect(effect, fragment) {
    if (!effect.nodes) return;
    var node = effect.nodes.start;
    var end = effect.nodes.end;
    while (node !== null) {
      var next = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
      fragment.append(node);
      node = next;
    }
  }
  let is_updating_effect = false;
  let is_destroying_effect = false;
  function set_is_destroying_effect(value) {
    is_destroying_effect = value;
  }
  let active_reaction = null;
  let untracking = false;
  function set_active_reaction(reaction) {
    active_reaction = reaction;
  }
  let active_effect = null;
  function set_active_effect(effect) {
    active_effect = effect;
  }
  let current_sources = null;
  function push_reaction_value(value) {
    if (active_reaction !== null && true) {
      (current_sources ??= /* @__PURE__ */ new Set()).add(value);
    }
  }
  let new_deps = null;
  let skipped_deps = 0;
  let untracked_writes = null;
  function set_untracked_writes(value) {
    untracked_writes = value;
  }
  let write_version = 1;
  let read_version = 0;
  let update_version = read_version;
  function set_update_version(value) {
    update_version = value;
  }
  function increment_write_version() {
    return ++write_version;
  }
  function is_dirty(reaction) {
    var flags2 = reaction.f;
    if ((flags2 & DIRTY) !== 0) {
      return true;
    }
    if (flags2 & DERIVED) {
      reaction.f &= ~WAS_MARKED;
    }
    if ((flags2 & MAYBE_DIRTY) !== 0) {
      var dependencies = (
        /** @type {Value[]} */
        reaction.deps
      );
      var length = dependencies.length;
      for (var i = 0; i < length; i++) {
        var dependency = dependencies[i];
        if (is_dirty(
          /** @type {Derived} */
          dependency
        )) {
          update_derived(
            /** @type {Derived} */
            dependency
          );
        }
        if (dependency.wv > reaction.wv) {
          return true;
        }
      }
      if ((flags2 & CONNECTED) !== 0 && // During time traveling we don't want to reset the status so that
      // traversal of the graph in the other batches still happens
      batch_values === null) {
        set_signal_status(reaction, CLEAN);
      }
    }
    return false;
  }
  function schedule_possible_effect_self_invalidation(signal, effect, root2 = true) {
    var reactions = signal.reactions;
    if (reactions === null) return;
    if (current_sources !== null && current_sources.has(signal)) {
      return;
    }
    for (var i = 0; i < reactions.length; i++) {
      var reaction = reactions[i];
      if ((reaction.f & DERIVED) !== 0) {
        schedule_possible_effect_self_invalidation(
          /** @type {Derived} */
          reaction,
          effect,
          false
        );
      } else if (effect === reaction) {
        if (root2) {
          set_signal_status(reaction, DIRTY);
        } else if ((reaction.f & CLEAN) !== 0) {
          set_signal_status(reaction, MAYBE_DIRTY);
        }
        schedule_effect(
          /** @type {Effect} */
          reaction
        );
      }
    }
  }
  function update_reaction(reaction) {
    var previous_deps = new_deps;
    var previous_skipped_deps = skipped_deps;
    var previous_untracked_writes = untracked_writes;
    var previous_reaction = active_reaction;
    var previous_sources = current_sources;
    var previous_component_context = component_context;
    var previous_untracking = untracking;
    var previous_update_version = update_version;
    var flags2 = reaction.f;
    new_deps = /** @type {null | Value[]} */
    null;
    skipped_deps = 0;
    untracked_writes = null;
    active_reaction = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
    current_sources = null;
    set_component_context(reaction.ctx);
    untracking = false;
    update_version = ++read_version;
    if (reaction.ac !== null) {
      without_reactive_context(() => {
        reaction.ac.abort(STALE_REACTION);
      });
      reaction.ac = null;
    }
    try {
      reaction.f |= REACTION_IS_UPDATING;
      var fn = (
        /** @type {Function} */
        reaction.fn
      );
      var result = fn();
      reaction.f |= REACTION_RAN;
      var deps = reaction.deps;
      var is_fork = current_batch?.is_fork;
      if (new_deps !== null) {
        var i;
        if (!is_fork) {
          remove_reactions(reaction, skipped_deps);
        }
        if (deps !== null && skipped_deps > 0) {
          deps.length = skipped_deps + new_deps.length;
          for (i = 0; i < new_deps.length; i++) {
            deps[skipped_deps + i] = new_deps[i];
          }
        } else {
          reaction.deps = deps = new_deps;
        }
        if (effect_tracking() && (reaction.f & CONNECTED) !== 0) {
          for (i = skipped_deps; i < deps.length; i++) {
            (deps[i].reactions ??= []).push(reaction);
          }
        }
      } else if (!is_fork && deps !== null && skipped_deps < deps.length) {
        remove_reactions(reaction, skipped_deps);
        deps.length = skipped_deps;
      }
      if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0) {
        for (i = 0; i < /** @type {Source[]} */
        untracked_writes.length; i++) {
          schedule_possible_effect_self_invalidation(
            untracked_writes[i],
            /** @type {Effect} */
            reaction
          );
        }
      }
      if (previous_reaction !== null && previous_reaction !== reaction) {
        read_version++;
        if (previous_reaction.deps !== null) {
          for (let i2 = 0; i2 < previous_skipped_deps; i2 += 1) {
            previous_reaction.deps[i2].rv = read_version;
          }
        }
        if (previous_deps !== null) {
          for (const dep of previous_deps) {
            dep.rv = read_version;
          }
        }
        if (untracked_writes !== null) {
          if (previous_untracked_writes === null) {
            previous_untracked_writes = untracked_writes;
          } else {
            previous_untracked_writes.push(.../** @type {Source[]} */
            untracked_writes);
          }
        }
      }
      if ((reaction.f & ERROR_VALUE) !== 0) {
        reaction.f ^= ERROR_VALUE;
      }
      return result;
    } catch (error) {
      return handle_error(error);
    } finally {
      reaction.f ^= REACTION_IS_UPDATING;
      new_deps = previous_deps;
      skipped_deps = previous_skipped_deps;
      untracked_writes = previous_untracked_writes;
      active_reaction = previous_reaction;
      current_sources = previous_sources;
      set_component_context(previous_component_context);
      untracking = previous_untracking;
      update_version = previous_update_version;
    }
  }
  function remove_reaction(signal, dependency) {
    let reactions = dependency.reactions;
    if (reactions !== null) {
      var index2 = index_of.call(reactions, signal);
      if (index2 !== -1) {
        var new_length = reactions.length - 1;
        if (new_length === 0) {
          reactions = dependency.reactions = null;
        } else {
          reactions[index2] = reactions[new_length];
          reactions.pop();
        }
      }
    }
    if (reactions === null && (dependency.f & DERIVED) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
    // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
    // allows us to skip the expensive work of disconnecting and immediately reconnecting it
    (new_deps === null || !includes.call(new_deps, dependency))) {
      var derived2 = (
        /** @type {Derived} */
        dependency
      );
      if ((derived2.f & CONNECTED) !== 0) {
        derived2.f ^= CONNECTED;
        derived2.f &= ~WAS_MARKED;
      }
      if (derived2.v !== UNINITIALIZED) {
        update_derived_status(derived2);
      }
      if (derived2.ac !== null) {
        without_reactive_context(() => {
          derived2.ac.abort(STALE_REACTION);
          derived2.ac = null;
          set_signal_status(derived2, DIRTY);
        });
      }
      freeze_derived_effects(derived2);
      remove_reactions(derived2, 0);
    }
  }
  function remove_reactions(signal, start_index) {
    var dependencies = signal.deps;
    if (dependencies === null) return;
    for (var i = start_index; i < dependencies.length; i++) {
      remove_reaction(signal, dependencies[i]);
    }
  }
  function update_effect(effect) {
    var flags2 = effect.f;
    if ((flags2 & DESTROYED) !== 0) {
      return;
    }
    set_signal_status(effect, CLEAN);
    var previous_effect = active_effect;
    var was_updating_effect = is_updating_effect;
    active_effect = effect;
    is_updating_effect = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) === 0;
    try {
      if ((flags2 & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
        destroy_block_effect_children(effect);
      } else {
        destroy_effect_children(effect);
      }
      execute_effect_teardown(effect);
      var teardown2 = update_reaction(effect);
      effect.teardown = typeof teardown2 === "function" ? teardown2 : null;
      effect.wv = write_version;
      var dep;
      if (DEV && tracing_mode_flag && (effect.f & DIRTY) !== 0 && effect.deps !== null) ;
    } finally {
      is_updating_effect = was_updating_effect;
      active_effect = previous_effect;
    }
  }
  function get(signal) {
    var flags2 = signal.f;
    var is_derived = (flags2 & DERIVED) !== 0;
    if (active_reaction !== null && !untracking) {
      var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;
      if (!destroyed && (current_sources === null || !current_sources.has(signal))) {
        var deps = active_reaction.deps;
        if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
          if (signal.rv < read_version) {
            signal.rv = read_version;
            if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
              skipped_deps++;
            } else if (new_deps === null) {
              new_deps = [signal];
            } else {
              new_deps.push(signal);
            }
          }
        } else {
          active_reaction.deps ??= [];
          if (!includes.call(active_reaction.deps, signal)) {
            active_reaction.deps.push(signal);
          }
          var reactions = signal.reactions;
          if (reactions === null) {
            signal.reactions = [active_reaction];
          } else if (!includes.call(reactions, active_reaction)) {
            reactions.push(active_reaction);
          }
        }
      }
    }
    if (is_destroying_effect && old_values.has(signal)) {
      return old_values.get(signal);
    }
    if (is_derived) {
      var derived2 = (
        /** @type {Derived} */
        signal
      );
      if (is_destroying_effect) {
        var value = derived2.v;
        if ((derived2.f & CLEAN) === 0 && derived2.reactions !== null || depends_on_old_values(derived2)) {
          value = execute_derived(derived2);
        }
        old_values.set(derived2, value);
        return value;
      }
      var should_connect = (derived2.f & CONNECTED) === 0 && !untracking && active_reaction !== null && (is_updating_effect || (active_reaction.f & CONNECTED) !== 0);
      var is_new = (derived2.f & REACTION_RAN) === 0;
      if (is_dirty(derived2)) {
        if (should_connect) {
          derived2.f |= CONNECTED;
        }
        update_derived(derived2);
      }
      if (should_connect && !is_new) {
        unfreeze_derived_effects(derived2);
        reconnect(derived2);
      }
    }
    if (batch_values?.has(signal)) {
      return batch_values.get(signal);
    }
    if ((signal.f & ERROR_VALUE) !== 0) {
      throw signal.v;
    }
    return signal.v;
  }
  function reconnect(derived2) {
    derived2.f |= CONNECTED;
    if (derived2.deps === null) return;
    for (const dep of derived2.deps) {
      (dep.reactions ??= []).push(derived2);
      if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
        unfreeze_derived_effects(
          /** @type {Derived} */
          dep
        );
        reconnect(
          /** @type {Derived} */
          dep
        );
      }
    }
  }
  function depends_on_old_values(derived2) {
    if (derived2.v === UNINITIALIZED) return true;
    if (derived2.deps === null) return false;
    for (const dep of derived2.deps) {
      if (old_values.has(dep)) {
        return true;
      }
      if ((dep.f & DERIVED) !== 0 && depends_on_old_values(
        /** @type {Derived} */
        dep
      )) {
        return true;
      }
    }
    return false;
  }
  function untrack(fn) {
    var previous_untracking = untracking;
    try {
      untracking = true;
      return fn();
    } finally {
      untracking = previous_untracking;
    }
  }
  const PASSIVE_EVENTS = ["touchstart", "touchmove"];
  function is_passive_event(name) {
    return PASSIVE_EVENTS.includes(name);
  }
  const event_symbol = /* @__PURE__ */ Symbol("events");
  const all_registered_events = /* @__PURE__ */ new Set();
  const root_event_handles = /* @__PURE__ */ new Set();
  function delegated(event_name, element, handler) {
    (element[event_symbol] ??= {})[event_name] = handler;
  }
  function delegate(events) {
    for (var i = 0; i < events.length; i++) {
      all_registered_events.add(events[i]);
    }
    for (var fn of root_event_handles) {
      fn(events);
    }
  }
  let last_propagated_event = null;
  let last_propagated_event_clear_scheduled = false;
  function handle_event_propagation(event) {
    var handler_element = this;
    var owner_document = (
      /** @type {Node} */
      handler_element.ownerDocument
    );
    var event_name = event.type;
    var path = event.composedPath?.() || [];
    var current_target = (
      /** @type {null | Element} */
      path[0] || event.target
    );
    last_propagated_event = event;
    if (!last_propagated_event_clear_scheduled) {
      last_propagated_event_clear_scheduled = true;
      setTimeout(() => {
        last_propagated_event_clear_scheduled = false;
        last_propagated_event = null;
      });
    }
    var path_idx = 0;
    var handled_at = last_propagated_event === event && event[event_symbol];
    if (handled_at) {
      var at_idx = path.indexOf(handled_at);
      if (at_idx !== -1 && (handler_element === document || handler_element === /** @type {any} */
      window)) {
        event[event_symbol] = handler_element;
        return;
      }
      var handler_idx = path.indexOf(handler_element);
      if (handler_idx === -1) {
        return;
      }
      if (at_idx <= handler_idx) {
        path_idx = at_idx;
      }
    }
    current_target = /** @type {Element} */
    path[path_idx] || event.target;
    if (current_target === handler_element) return;
    define_property(event, "currentTarget", {
      configurable: true,
      get() {
        return current_target || owner_document;
      }
    });
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(null);
    set_active_effect(null);
    try {
      var throw_error;
      var other_errors = [];
      while (current_target !== null) {
        if (current_target === handler_element) break;
        try {
          var delegated2 = current_target[event_symbol]?.[event_name];
          if (delegated2 != null && (!/** @type {any} */
          current_target.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
          // -> the target could not have been disabled because it emits the event in the first place
          event.target === current_target)) {
            delegated2.call(current_target, event);
          }
        } catch (error) {
          if (throw_error) {
            other_errors.push(error);
          } else {
            throw_error = error;
          }
        }
        if (event.cancelBubble) break;
        path_idx++;
        current_target = path_idx < path.length ? (
          /** @type {Element} */
          path[path_idx]
        ) : null;
      }
      if (throw_error) {
        for (let error of other_errors) {
          queueMicrotask(() => {
            throw error;
          });
        }
        throw throw_error;
      }
    } finally {
      event[event_symbol] = handler_element;
      delete event.currentTarget;
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
  }
  const policy = (
    // We gotta write it like this because after downleveling the pure comment may end up in the wrong location
    globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", {
      /** @param {string} html */
      createHTML: (html) => {
        return html;
      }
    })
  );
  function create_trusted_html(html) {
    return (
      /** @type {string} */
      policy?.createHTML(html) ?? html
    );
  }
  function create_fragment_from_html(html) {
    var elem = create_element("template");
    elem.innerHTML = create_trusted_html(html.replaceAll("<!>", "<!---->"));
    return elem.content;
  }
  function assign_nodes(start, end) {
    var effect = (
      /** @type {Effect} */
      active_effect
    );
    if (effect.nodes === null) {
      effect.nodes = { start, end, a: null, t: null };
    }
  }
  // @__NO_SIDE_EFFECTS__
  function from_html(content, flags2) {
    var is_fragment = (flags2 & TEMPLATE_FRAGMENT) !== 0;
    var use_import_node = (flags2 & TEMPLATE_USE_IMPORT_NODE) !== 0;
    var node;
    var has_start = !content.startsWith("<!>");
    return () => {
      if (node === void 0) {
        node = create_fragment_from_html(has_start ? content : "<!>" + content);
        if (!is_fragment) node = /** @type {TemplateNode} */
        /* @__PURE__ */ get_first_child(node);
      }
      var clone = (
        /** @type {TemplateNode} */
        use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true)
      );
      if (is_fragment) {
        var start = (
          /** @type {TemplateNode} */
          /* @__PURE__ */ get_first_child(clone)
        );
        var end = (
          /** @type {TemplateNode} */
          clone.lastChild
        );
        assign_nodes(start, end);
      } else {
        assign_nodes(clone, clone);
      }
      return clone;
    };
  }
  function text(value = "") {
    {
      var t = create_text(value + "");
      assign_nodes(t, t);
      return t;
    }
  }
  function comment() {
    var frag = document.createDocumentFragment();
    var start = document.createComment("");
    var anchor = create_text();
    frag.append(start, anchor);
    assign_nodes(start, anchor);
    return frag;
  }
  function append(anchor, dom) {
    if (anchor === null) {
      return;
    }
    anchor.before(
      /** @type {Node} */
      dom
    );
  }
  function set_text(text2, value) {
    var str = value == null ? "" : typeof value === "object" ? `${value}` : value;
    if (str !== /** @type {any} */
    (text2[TEXT_CACHE] ??= text2.nodeValue)) {
      text2[TEXT_CACHE] = str;
      text2.nodeValue = `${str}`;
    }
  }
  function mount(component, options) {
    return _mount(component, options);
  }
  const listeners = /* @__PURE__ */ new Map();
  function _mount(Component, { target: target2, anchor, props = {}, events, context, intro = true, transformError }) {
    init_operations();
    var component = void 0;
    var unmount = component_root(() => {
      var anchor_node = anchor ?? target2.appendChild(create_text());
      boundary(
        /** @type {TemplateNode} */
        anchor_node,
        {
          pending: () => {
          }
        },
        (anchor_node2) => {
          push({});
          var ctx = (
            /** @type {ComponentContext} */
            component_context
          );
          if (context) ctx.c = context;
          if (events) {
            props.$$events = events;
          }
          component = Component(anchor_node2, props) || {};
          pop();
        },
        transformError
      );
      var registered_events = /* @__PURE__ */ new Set();
      var event_handle = (events2) => {
        for (var i = 0; i < events2.length; i++) {
          var event_name = events2[i];
          if (registered_events.has(event_name)) continue;
          registered_events.add(event_name);
          var passive = is_passive_event(event_name);
          for (const node of [target2, document]) {
            var counts = listeners.get(node);
            if (counts === void 0) {
              counts = /* @__PURE__ */ new Map();
              listeners.set(node, counts);
            }
            var count = counts.get(event_name);
            if (count === void 0) {
              node.addEventListener(event_name, handle_event_propagation, { passive });
              counts.set(event_name, 1);
            } else {
              counts.set(event_name, count + 1);
            }
          }
        }
      };
      event_handle(array_from(all_registered_events));
      root_event_handles.add(event_handle);
      return () => {
        for (var event_name of registered_events) {
          for (const node of [target2, document]) {
            var counts = (
              /** @type {Map<string, number>} */
              listeners.get(node)
            );
            var count = (
              /** @type {number} */
              counts.get(event_name)
            );
            if (--count == 0) {
              node.removeEventListener(event_name, handle_event_propagation);
              counts.delete(event_name);
              if (counts.size === 0) {
                listeners.delete(node);
              }
            } else {
              counts.set(event_name, count);
            }
          }
        }
        root_event_handles.delete(event_handle);
        if (anchor_node !== anchor) {
          anchor_node.parentNode?.removeChild(anchor_node);
        }
      };
    });
    mounted_components.set(component, unmount);
    return component;
  }
  let mounted_components = /* @__PURE__ */ new WeakMap();
  class BranchManager {
    /** @type {TemplateNode} */
    anchor;
    /** @type {Map<Batch, Key>} */
    #batches = /* @__PURE__ */ new Map();
    /**
     * Map of keys to effects that are currently rendered in the DOM.
     * These effects are visible and actively part of the document tree.
     * Example:
     * ```
     * {#if condition}
     * 	foo
     * {:else}
     * 	bar
     * {/if}
     * ```
     * Can result in the entries `true->Effect` and `false->Effect`
     * @type {Map<Key, Effect>}
     */
    #onscreen = /* @__PURE__ */ new Map();
    /**
     * Similar to #onscreen with respect to the keys, but contains branches that are not yet
     * in the DOM, because their insertion is deferred.
     * @type {Map<Key, Branch>}
     */
    #offscreen = /* @__PURE__ */ new Map();
    /**
     * Keys of effects that are currently outroing
     * @type {Set<Key>}
     */
    #outroing = /* @__PURE__ */ new Set();
    /**
     * Whether to pause (i.e. outro) on change, or destroy immediately.
     * This is necessary for `<svelte:element>`
     */
    #transition = true;
    /**
     * @param {TemplateNode} anchor
     * @param {boolean} transition
     */
    constructor(anchor, transition = true) {
      this.anchor = anchor;
      this.#transition = transition;
    }
    /**
     * @param {Batch} batch
     */
    #commit = (batch) => {
      if (!this.#batches.has(batch)) return;
      var key = (
        /** @type {Key} */
        this.#batches.get(batch)
      );
      var onscreen = this.#onscreen.get(key);
      if (onscreen) {
        resume_effect(onscreen);
        this.#outroing.delete(key);
      } else {
        var offscreen = this.#offscreen.get(key);
        if (offscreen) {
          resume_effect(offscreen.effect);
          this.#onscreen.set(key, offscreen.effect);
          this.#offscreen.delete(key);
          offscreen.fragment.lastChild.remove();
          this.anchor.before(offscreen.fragment);
          onscreen = offscreen.effect;
        }
      }
      for (const [b, k] of this.#batches) {
        this.#batches.delete(b);
        if (b === batch) {
          break;
        }
        const offscreen2 = this.#offscreen.get(k);
        if (offscreen2) {
          destroy_effect(offscreen2.effect);
          this.#offscreen.delete(k);
        }
      }
      for (const [k, effect] of this.#onscreen) {
        if (k === key || this.#outroing.has(k)) continue;
        const on_destroy = () => {
          const keys = Array.from(this.#batches.values());
          if (keys.includes(k)) {
            var fragment = document.createDocumentFragment();
            move_effect(effect, fragment);
            fragment.append(create_text());
            this.#offscreen.set(k, { effect, fragment });
          } else {
            destroy_effect(effect);
          }
          this.#outroing.delete(k);
          this.#onscreen.delete(k);
        };
        if (this.#transition || !onscreen) {
          this.#outroing.add(k);
          pause_effect(effect, on_destroy, false);
        } else {
          on_destroy();
        }
      }
    };
    /**
     * @param {Batch} batch
     */
    #discard = (batch) => {
      this.#batches.delete(batch);
      const keys = Array.from(this.#batches.values());
      for (const [k, branch2] of this.#offscreen) {
        if (!keys.includes(k)) {
          destroy_effect(branch2.effect);
          this.#offscreen.delete(k);
        }
      }
    };
    /**
     *
     * @param {any} key
     * @param {null | ((target: TemplateNode) => void)} fn
     */
    ensure(key, fn) {
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      var defer = should_defer_append();
      if (fn && !this.#onscreen.has(key) && !this.#offscreen.has(key)) {
        if (defer) {
          var fragment = document.createDocumentFragment();
          var target2 = create_text();
          fragment.append(target2);
          this.#offscreen.set(key, {
            effect: branch(() => fn(target2)),
            fragment
          });
        } else {
          this.#onscreen.set(
            key,
            branch(() => fn(this.anchor))
          );
        }
      }
      this.#batches.set(batch, key);
      if (defer) {
        for (const [k, effect] of this.#onscreen) {
          if (k === key) {
            batch.unskip_effect(effect);
          } else {
            batch.skip_effect(effect);
          }
        }
        for (const [k, branch2] of this.#offscreen) {
          if (k === key) {
            batch.unskip_effect(branch2.effect);
          } else {
            batch.skip_effect(branch2.effect);
          }
        }
        batch.oncommit(this.#commit);
        batch.ondiscard(this.#discard);
      } else {
        this.#commit(batch);
      }
    }
  }
  function if_block(node, fn, elseif = false) {
    var branches = new BranchManager(node);
    var flags2 = elseif ? EFFECT_TRANSPARENT : 0;
    function update_branch(key, fn2) {
      branches.ensure(key, fn2);
    }
    block(() => {
      var has_branch = false;
      fn((fn2, key = 0) => {
        has_branch = true;
        update_branch(key, fn2);
      });
      if (!has_branch) {
        update_branch(-1, null);
      }
    }, flags2);
  }
  function index(_, i) {
    return i;
  }
  function pause_effects(state2, to_destroy, controlled_anchor) {
    var transitions = [];
    var length = to_destroy.length;
    var group;
    var remaining = to_destroy.length;
    for (var i = 0; i < length; i++) {
      let effect = to_destroy[i];
      pause_effect(
        effect,
        () => {
          if (group) {
            group.pending.delete(effect);
            group.done.add(effect);
            if (group.pending.size === 0) {
              var groups = (
                /** @type {Set<EachOutroGroup>} */
                state2.outrogroups
              );
              destroy_effects(state2, array_from(group.done));
              groups.delete(group);
              if (groups.size === 0) {
                state2.outrogroups = null;
              }
            }
          } else {
            remaining -= 1;
          }
        },
        false
      );
    }
    if (remaining === 0) {
      var fast_path = transitions.length === 0 && controlled_anchor !== null && state2.pending.size === 0;
      if (fast_path) {
        var anchor = (
          /** @type {Element} */
          controlled_anchor
        );
        var parent_node = (
          /** @type {Element} */
          anchor.parentNode
        );
        clear_text_content(parent_node);
        parent_node.append(anchor);
        state2.items.clear();
      }
      destroy_effects(state2, to_destroy, !fast_path);
    } else {
      group = {
        pending: new Set(to_destroy),
        done: /* @__PURE__ */ new Set()
      };
      (state2.outrogroups ??= /* @__PURE__ */ new Set()).add(group);
    }
  }
  function destroy_effects(state2, to_destroy, remove_dom = true) {
    var preserved_effects;
    if (state2.pending.size > 0) {
      preserved_effects = /* @__PURE__ */ new Set();
      for (const keys of state2.pending.values()) {
        for (const key of keys) {
          preserved_effects.add(
            /** @type {EachItem} */
            state2.items.get(key).e
          );
        }
      }
    }
    for (var i = 0; i < to_destroy.length; i++) {
      var e = to_destroy[i];
      if (preserved_effects?.has(e)) {
        e.f |= EFFECT_OFFSCREEN;
        const fragment = document.createDocumentFragment();
        move_effect(e, fragment);
      } else {
        destroy_effect(to_destroy[i], remove_dom);
      }
    }
  }
  var offscreen_anchor;
  function each(node, flags2, get_collection, get_key, render_fn, fallback_fn = null) {
    var anchor = node;
    var items = /* @__PURE__ */ new Map();
    var is_controlled = (flags2 & EACH_IS_CONTROLLED) !== 0;
    if (is_controlled) {
      var parent_node = (
        /** @type {Element} */
        node
      );
      anchor = parent_node.appendChild(create_text());
    }
    var fallback = null;
    var each_array = /* @__PURE__ */ derived_safe_equal(() => {
      var collection = get_collection();
      return (
        /** @type {V[]} */
        is_array(collection) ? collection : collection == null ? [] : array_from(collection)
      );
    });
    var array;
    var pending = /* @__PURE__ */ new Map();
    var first_run = true;
    function commit(batch) {
      if ((state2.effect.f & DESTROYED) !== 0) {
        return;
      }
      state2.pending.delete(batch);
      state2.fallback = fallback;
      reconcile(state2, array, anchor, flags2, get_key);
      if (fallback !== null) {
        if (array.length === 0) {
          if ((fallback.f & EFFECT_OFFSCREEN) === 0) {
            resume_effect(fallback);
          } else {
            fallback.f ^= EFFECT_OFFSCREEN;
            move(fallback, null, anchor);
          }
        } else {
          pause_effect(fallback, () => {
            fallback = null;
          });
        }
      }
    }
    function discard(batch) {
      state2.pending.delete(batch);
    }
    var effect = block(() => {
      array = /** @type {V[]} */
      get(each_array);
      var length = array.length;
      var keys = /* @__PURE__ */ new Set();
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      var defer = should_defer_append();
      for (var index2 = 0; index2 < length; index2 += 1) {
        var value = array[index2];
        var key = get_key(value, index2);
        var item = first_run ? null : items.get(key);
        if (item) {
          if (item.v) internal_set(item.v, value);
          if (item.i) internal_set(item.i, index2);
          if (defer) {
            batch.unskip_effect(item.e);
          }
        } else {
          item = create_item(
            items,
            first_run ? anchor : offscreen_anchor ??= create_text(),
            value,
            key,
            index2,
            render_fn,
            flags2,
            get_collection
          );
          if (!first_run) {
            item.e.f |= EFFECT_OFFSCREEN;
          }
          items.set(key, item);
        }
        keys.add(key);
      }
      if (length === 0 && fallback_fn && !fallback) {
        if (first_run) {
          fallback = branch(() => fallback_fn(anchor));
        } else {
          fallback = branch(() => fallback_fn(offscreen_anchor ??= create_text()));
          fallback.f |= EFFECT_OFFSCREEN;
        }
      }
      if (length > keys.size) {
        {
          each_key_duplicate();
        }
      }
      if (!first_run) {
        pending.set(batch, keys);
        if (defer) {
          for (const [key2, item2] of items) {
            if (!keys.has(key2)) {
              batch.skip_effect(item2.e);
            }
          }
          batch.oncommit(commit);
          batch.ondiscard(discard);
        } else {
          commit(batch);
        }
      }
      get(each_array);
    });
    var state2 = { effect, items, pending, outrogroups: null, fallback };
    first_run = false;
  }
  function skip_to_branch(effect) {
    while (effect !== null && (effect.f & BRANCH_EFFECT) === 0) {
      effect = effect.next;
    }
    return effect;
  }
  function reconcile(state2, array, anchor, flags2, get_key) {
    var is_animated = (flags2 & EACH_IS_ANIMATED) !== 0;
    var length = array.length;
    var items = state2.items;
    var current = skip_to_branch(state2.effect.first);
    var seen;
    var prev = null;
    var to_animate;
    var matched = [];
    var stashed = [];
    var value;
    var key;
    var effect;
    var i;
    if (is_animated) {
      for (i = 0; i < length; i += 1) {
        value = array[i];
        key = get_key(value, i);
        effect = /** @type {EachItem} */
        items.get(key).e;
        if ((effect.f & EFFECT_OFFSCREEN) === 0) {
          effect.nodes?.a?.measure();
          (to_animate ??= /* @__PURE__ */ new Set()).add(effect);
        }
      }
    }
    for (i = 0; i < length; i += 1) {
      value = array[i];
      key = get_key(value, i);
      effect = /** @type {EachItem} */
      items.get(key).e;
      if (state2.outrogroups !== null) {
        for (const group of state2.outrogroups) {
          group.pending.delete(effect);
          group.done.delete(effect);
        }
      }
      if ((effect.f & INERT) !== 0) {
        resume_effect(effect);
        if (is_animated) {
          effect.nodes?.a?.unfix();
          (to_animate ??= /* @__PURE__ */ new Set()).delete(effect);
        }
      }
      if ((effect.f & EFFECT_OFFSCREEN) !== 0) {
        effect.f ^= EFFECT_OFFSCREEN;
        if (effect === current) {
          move(effect, null, anchor);
        } else {
          var next = prev ? prev.next : current;
          if (effect === state2.effect.last) {
            state2.effect.last = effect.prev;
          }
          if (effect.prev) effect.prev.next = effect.next;
          if (effect.next) effect.next.prev = effect.prev;
          link(state2, prev, effect);
          link(state2, effect, next);
          move(effect, next, anchor);
          prev = effect;
          matched = [];
          stashed = [];
          current = skip_to_branch(prev.next);
          continue;
        }
      }
      if (effect !== current) {
        if (seen !== void 0 && seen.has(effect)) {
          if (matched.length < stashed.length) {
            var start = stashed[0];
            var j;
            prev = start.prev;
            var a = matched[0];
            var b = matched[matched.length - 1];
            for (j = 0; j < matched.length; j += 1) {
              move(matched[j], start, anchor);
            }
            for (j = 0; j < stashed.length; j += 1) {
              seen.delete(stashed[j]);
            }
            link(state2, a.prev, b.next);
            link(state2, prev, a);
            link(state2, b, start);
            current = start;
            prev = b;
            i -= 1;
            matched = [];
            stashed = [];
          } else {
            seen.delete(effect);
            move(effect, current, anchor);
            link(state2, effect.prev, effect.next);
            link(state2, effect, prev === null ? state2.effect.first : prev.next);
            link(state2, prev, effect);
            prev = effect;
          }
          continue;
        }
        matched = [];
        stashed = [];
        while (current !== null && current !== effect) {
          (seen ??= /* @__PURE__ */ new Set()).add(current);
          stashed.push(current);
          current = skip_to_branch(current.next);
        }
        if (current === null) {
          continue;
        }
      }
      if ((effect.f & EFFECT_OFFSCREEN) === 0) {
        matched.push(effect);
      }
      prev = effect;
      current = skip_to_branch(effect.next);
    }
    if (state2.outrogroups !== null) {
      for (const group of state2.outrogroups) {
        if (group.pending.size === 0) {
          destroy_effects(state2, array_from(group.done));
          state2.outrogroups?.delete(group);
        }
      }
      if (state2.outrogroups.size === 0) {
        state2.outrogroups = null;
      }
    }
    if (current !== null || seen !== void 0) {
      var to_destroy = [];
      if (seen !== void 0) {
        for (effect of seen) {
          if ((effect.f & INERT) === 0) {
            to_destroy.push(effect);
          }
        }
      }
      while (current !== null) {
        if ((current.f & INERT) === 0 && current !== state2.fallback) {
          to_destroy.push(current);
        }
        current = skip_to_branch(current.next);
      }
      var destroy_length = to_destroy.length;
      if (destroy_length > 0) {
        var controlled_anchor = (flags2 & EACH_IS_CONTROLLED) !== 0 && length === 0 ? anchor : null;
        if (is_animated) {
          for (i = 0; i < destroy_length; i += 1) {
            to_destroy[i].nodes?.a?.measure();
          }
          for (i = 0; i < destroy_length; i += 1) {
            to_destroy[i].nodes?.a?.fix();
          }
        }
        pause_effects(state2, to_destroy, controlled_anchor);
      }
    }
    if (is_animated) {
      queue_micro_task(() => {
        if (to_animate === void 0) return;
        for (effect of to_animate) {
          effect.nodes?.a?.apply();
        }
      });
    }
  }
  function create_item(items, anchor, value, key, index2, render_fn, flags2, get_collection) {
    var v = (flags2 & EACH_ITEM_REACTIVE) !== 0 ? (flags2 & EACH_ITEM_IMMUTABLE) === 0 ? /* @__PURE__ */ mutable_source(value, false, false) : source(value) : null;
    var i = (flags2 & EACH_INDEX_REACTIVE) !== 0 ? source(index2) : null;
    return {
      v,
      i,
      e: branch(() => {
        render_fn(anchor, v ?? value, i ?? index2, get_collection);
        return () => {
          items.delete(key);
        };
      })
    };
  }
  function move(effect, next, anchor) {
    if (!effect.nodes) return;
    var node = effect.nodes.start;
    var end = effect.nodes.end;
    var dest = next && (next.f & EFFECT_OFFSCREEN) === 0 ? (
      /** @type {EffectNodes} */
      next.nodes.start
    ) : anchor;
    while (node !== null) {
      var next_node = (
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node)
      );
      dest.before(node);
      if (node === end) {
        return;
      }
      node = next_node;
    }
  }
  function link(state2, prev, next) {
    if (prev === null) {
      state2.effect.first = next;
    } else {
      prev.next = next;
    }
    if (next === null) {
      state2.effect.last = prev;
    } else {
      next.prev = prev;
    }
  }
  const whitespace = [..." 	\n\r\f \v\uFEFF"];
  function to_class(value, hash, directives) {
    var classname = value == null ? "" : "" + value;
    if (directives) {
      for (var key of Object.keys(directives)) {
        if (directives[key]) {
          classname = classname ? classname + " " + key : key;
        } else if (classname.length) {
          var len = key.length;
          var a = 0;
          while ((a = classname.indexOf(key, a)) >= 0) {
            var b = a + len;
            if ((a === 0 || whitespace.includes(classname[a - 1])) && (b === classname.length || whitespace.includes(classname[b]))) {
              classname = (a === 0 ? "" : classname.substring(0, a)) + classname.substring(b + 1);
            } else {
              a = b;
            }
          }
        }
      }
    }
    return classname === "" ? null : classname;
  }
  function set_class(dom, is_html, value, hash, prev_classes, next_classes) {
    var prev = (
      /** @type {any} */
      dom[CLASS_CACHE]
    );
    if (prev !== value || prev === void 0) {
      var next_class_name = to_class(value, hash, next_classes);
      {
        if (next_class_name == null) {
          dom.removeAttribute("class");
        } else if (is_html) {
          dom.className = next_class_name;
        } else {
          dom.setAttribute("class", next_class_name);
        }
      }
      dom[CLASS_CACHE] = value;
    } else if (next_classes && prev_classes !== next_classes) {
      for (var key in next_classes) {
        var is_present = !!next_classes[key];
        if (prev_classes == null || is_present !== !!prev_classes[key]) {
          dom.classList.toggle(key, is_present);
        }
      }
    }
    return next_classes;
  }
  const IS_CUSTOM_ELEMENT = /* @__PURE__ */ Symbol("is custom element");
  const IS_HTML = /* @__PURE__ */ Symbol("is html");
  function set_attribute(element, attribute, value, skip_warning) {
    var attributes = get_attributes(element);
    if (attributes[attribute] === (attributes[attribute] = value)) return;
    if (attribute === "loading") {
      element[LOADING_ATTR_SYMBOL] = value;
    }
    if (value == null) {
      element.removeAttribute(attribute);
    } else if (typeof value !== "string" && get_setters(element).includes(attribute)) {
      element[attribute] = value;
    } else {
      element.setAttribute(attribute, value);
    }
  }
  function get_attributes(element) {
    return (
      /** @type {Record<string | symbol, unknown>} **/
      /** @type {any} */
      element[ATTRIBUTES_CACHE] ??= {
        [IS_CUSTOM_ELEMENT]: element.nodeName.includes("-"),
        [IS_HTML]: element.namespaceURI === NAMESPACE_HTML
      }
    );
  }
  var setters_cache = /* @__PURE__ */ new Map();
  function get_setters(element) {
    var cache_key = element.getAttribute("is") || element.nodeName;
    var setters = setters_cache.get(cache_key);
    if (setters) return setters;
    setters_cache.set(cache_key, setters = []);
    var descriptors;
    var proto = element;
    var element_proto = Element.prototype;
    while (element_proto !== proto) {
      descriptors = get_descriptors(proto);
      for (var key in descriptors) {
        if (descriptors[key].set && // better safe than sorry, we don't want spread attributes to mess with HTML content
        key !== "innerHTML" && key !== "textContent" && key !== "innerText") {
          setters.push(key);
        }
      }
      proto = get_prototype_of(proto);
    }
    return setters;
  }
  const PUBLIC_VERSION = "5";
  if (typeof window !== "undefined") {
    ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add(PUBLIC_VERSION);
  }
  function extractProgressEvents(events) {
    return events.filter((e) => e.dir === "agent→page" && e.type === "progress").map((e) => e.payload);
  }
  function extractAgentLogEvents(events) {
    return events.filter((e) => e.dir === "agent→page" && e.type === "agent_log").map((e) => e.payload);
  }
  function mergeProgressNodes(existing, payloads) {
    for (const p of payloads) {
      const node = {
        id: p.id,
        label: p.label,
        parentId: p.parentId,
        status: p.status,
        startedAt: p.startedAt,
        endedAt: p.endedAt,
        kind: p.kind,
        children: []
      };
      existing.set(p.id, node);
    }
    return existing;
  }
  function buildProgressTree(nodes) {
    const byId = /* @__PURE__ */ new Map();
    for (const node of nodes.values()) {
      byId.set(node.id, { ...node, children: [] });
    }
    const roots = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
  function effectiveStatus(node) {
    if (node.children.length === 0) return node.status;
    const childStatuses = node.children.map(effectiveStatus);
    if (childStatuses.some((s) => s === "error")) return "error";
    if (childStatuses.some((s) => s === "running")) return "running";
    return node.status;
  }
  function createDebounce(callback, delayMs) {
    let timer = null;
    return {
      trigger: () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          callback();
        }, delayMs);
      },
      cancel: () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
      flush: () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
          callback();
        }
      }
    };
  }
  function isRootDone(roots) {
    if (roots.length === 0) return false;
    for (const root2 of roots) {
      if (effectiveStatus(root2) === "running") return false;
    }
    return roots.some((r) => effectiveStatus(r) === "done");
  }
  const DWELL_MS = 400;
  function createDwellManager(dwellMs = DWELL_MS, onExpire) {
    const lastStatus = /* @__PURE__ */ new Map();
    const dwelling = /* @__PURE__ */ new Map();
    const timers = /* @__PURE__ */ new Map();
    return {
      observe(id, status) {
        const prev = lastStatus.get(id);
        if (prev === "running" && (status === "done" || status === "error")) {
          const existing = timers.get(id);
          if (existing !== void 0) clearTimeout(existing);
          dwelling.set(id, status);
          const timer = setTimeout(() => {
            dwelling.delete(id);
            timers.delete(id);
            onExpire?.(id);
          }, dwellMs);
          timers.set(id, timer);
        }
        lastStatus.set(id, status);
      },
      isDwelling(id) {
        return dwelling.has(id);
      },
      displayStatus(id, realStatus) {
        if (dwelling.has(id)) return "running";
        return realStatus;
      },
      cancel() {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        dwelling.clear();
      }
    };
  }
  var root = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">Loading digest…</p>`);
  var root_1 = /* @__PURE__ */ from_html(`<span class="loading loading-spinner loading-xs shrink-0" aria-hidden="true"></span>`);
  var root_2 = /* @__PURE__ */ from_html(`<span class="shrink-0 text-error" aria-hidden="true">✕</span>`);
  var root_3 = /* @__PURE__ */ from_html(`<span class="shrink-0 text-success" aria-hidden="true">✓</span>`);
  var root_4 = /* @__PURE__ */ from_html(`<ul class="ml-6 flex flex-col gap-1" data-subtree=""></ul>`);
  var root_5 = /* @__PURE__ */ from_html(`<li><div class="flex items-center gap-2 py-1"><!> <span class="text-sm"> </span></div> <!></li>`);
  var root_6 = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">Preparing…</p>`);
  var root_7 = /* @__PURE__ */ from_html(`<ul class="flex flex-col gap-1"></ul>`);
  var root_8 = /* @__PURE__ */ from_html(`<li class="text-base-content/80" data-log-line=""> </li>`);
  var root_9 = /* @__PURE__ */ from_html(`<section class="shrink-0 max-h-[35%] overflow-auto border-t border-base-300 pt-3" data-agent-log=""><h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/70 mb-2">Agent log</h2> <ul class="space-y-0.5 text-sm"></ul></section>`);
  var root_10 = /* @__PURE__ */ from_html(`<div class="h-screen overflow-hidden bg-base-100 text-base-content p-4 sm:p-6"><div class="h-full max-w-3xl mx-auto flex flex-col gap-4"><header class="shrink-0"><h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Fetching digest…</h1></header> <section class="flex-1 min-h-0 overflow-auto" data-progress-tree=""><!></section> <!></div></div>`);
  var root_11 = /* @__PURE__ */ from_html(`<p class="text-error"> </p>`);
  var root_12 = /* @__PURE__ */ from_html(`<div class="pointer-events-auto alert alert-warning rounded-2xl shadow-lg max-w-sm w-full flex items-start gap-3"><span class="text-sm leading-snug flex-1 min-w-0"> </span> <button type="button" class="btn btn-ghost btn-xs shrink-0" aria-label="Dismiss warning"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg></button></div>`);
  var root_13 = /* @__PURE__ */ from_html(`<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>`);
  var root_14 = /* @__PURE__ */ from_html(`<blockquote class="bg-base-200/60 rounded-lg px-4 py-3 text-base text-base-content/80 leading-relaxed"> </blockquote>`);
  var root_15 = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">No summary available.</p>`);
  var root_16 = /* @__PURE__ */ from_html(`<li><span class="text-base-content/50">↳</span> <span class="text-base-content/70"> </span></li>`);
  var root_17 = /* @__PURE__ */ from_html(`<div class="mt-4 pt-4 border-t border-base-300"><p class="text-xs uppercase tracking-wide text-base-content/70 mb-2">Corrections</p> <ul class="space-y-1 text-sm"></ul></div>`);
  var root_18 = /* @__PURE__ */ from_html(`<li><p class="text-base-content/60 italic">None</p></li>`);
  var root_19 = /* @__PURE__ */ from_html(`<span class="text-base-content/60"> </span>`);
  var root_20 = /* @__PURE__ */ from_html(`<li><!> <!></li>`);
  var root_21 = /* @__PURE__ */ from_html(`<li><p class="text-base-content/60 italic">Nothing new since last run.</p></li>`);
  var root_22 = /* @__PURE__ */ from_html(`<a class="link link-primary link-hover min-w-0 underline-offset-2" target="_blank" rel="noreferrer"> </a>`);
  var root_23 = /* @__PURE__ */ from_html(`<span class="min-w-0"> </span>`);
  var root_24 = /* @__PURE__ */ from_html(`<li class="text-sm flex items-start gap-1.5"><span class="tooltip tooltip-right shrink-0"><span class="badge badge-sm border-0 bg-base-200 text-base-content/70" aria-hidden="true"> </span></span> <!></li>`);
  var root_25 = /* @__PURE__ */ from_html(`<li><p class="text-base-content/60 italic">No unread notifications.</p></li>`);
  var root_26 = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">No tasks in the queue.</p>`);
  var root_27 = /* @__PURE__ */ from_html(`<span class="font-medium text-base-content/50"> </span>`);
  var root_28 = /* @__PURE__ */ from_html(`<div class="flex items-center gap-2 text-sm"><span class="text-[10px] font-bold uppercase tracking-wider text-base-content/50">PR</span> <a class="link link-primary underline-offset-2" target="_blank" rel="noreferrer"> </a></div>`);
  var root_29 = /* @__PURE__ */ from_html(`<a class="link link-primary underline-offset-2" target="_blank" rel="noreferrer"> </a>`);
  var root_30 = /* @__PURE__ */ from_html(`<span class="text-base-content/80"> </span>`);
  var root_31 = /* @__PURE__ */ from_html(`· <span class="tabular-nums text-base-content/50"> </span>`, 1);
  var root_32 = /* @__PURE__ */ from_html(`<div class="flex items-center gap-2 text-sm"><span class="text-[10px] font-bold uppercase tracking-wider text-base-content/50">Branch</span> <!> <!></div>`);
  var root_33 = /* @__PURE__ */ from_html(`<!> <!>`, 1);
  var root_34 = /* @__PURE__ */ from_html(`<p class="text-xs italic text-base-content/40">No git links for this task.</p>`);
  var root_35 = /* @__PURE__ */ from_html(`<div class="mt-2 p-3 bg-base-200 rounded-lg flex flex-col gap-1.5"><!></div>`);
  var root_36 = /* @__PURE__ */ from_html(`<div class="flex items-start gap-3 py-3.5 pr-3.5 border-b border-base-200 last:border-b-0"><span class="text-2xl font-bold leading-none text-base-content/30 tabular-nums min-w-[1.5rem] text-right pt-0.5"> </span> <div class="flex-1 min-w-0"><p class="font-semibold text-[15px] leading-snug tracking-tight mb-2"><!> </p> <div class="flex flex-wrap items-center gap-1.5"><span class="badge badge-sm border-0 bg-base-200 text-base-content/70 font-semibold tracking-wide"> </span> <span class="badge badge-sm badge-outline border-base-300 text-base-content/60 font-semibold"> </span> <span class="badge badge-sm border-0 bg-primary/10 text-primary font-semibold"> </span> <span class="badge badge-sm border-0 bg-transparent text-base-content/70 font-semibold tabular-nums"> </span> <button type="button" class="btn btn-ghost btn-xs gap-1 ml-auto text-primary hover:bg-primary/10"><svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M4 2l4 4-4 4"></path></svg> Git</button></div> <!></div></div>`);
  var root_37 = /* @__PURE__ */ from_html(`<div class="flex flex-col"><!> <div class="flex justify-end gap-6 pt-2.5 mt-1 border-t-2 border-base-200 font-semibold text-sm"><span>Committed</span> <span class="tabular-nums"> </span> <span class="tabular-nums"> </span></div> <p class="text-xs text-base-content/50 mt-2"></p></div>`);
  var root_38 = /* @__PURE__ */ from_html(`<div class="grid grid-cols-2 sm:grid-cols-4 gap-4"><div class="flex flex-col gap-0.5"><span class="text-xs uppercase tracking-wide text-base-content/50">Base</span> <span class="text-lg font-semibold tabular-nums"> </span></div> <div class="flex flex-col gap-0.5"><span class="text-xs uppercase tracking-wide text-base-content/50">Committed</span> <span> <!></span></div> <div class="flex flex-col gap-0.5"><span class="text-xs uppercase tracking-wide text-base-content/50">Free</span> <span class="text-lg font-semibold tabular-nums"> </span></div> <div class="flex flex-col gap-0.5"><span class="text-xs uppercase tracking-wide text-base-content/50">Utilization</span> <span> <!></span></div></div> <p class="text-sm text-base-content/60 mt-3">Committed hours: <strong class="text-base-content tabular-nums"> </strong> </p>`, 1);
  var root_39 = /* @__PURE__ */ from_html(`<div><!></div>`);
  var root_40 = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">Nothing pending.</p>`);
  var root_41 = /* @__PURE__ */ from_html(`<th> </th>`);
  var root_42 = /* @__PURE__ */ from_html(`<td class="text-center"> </td>`);
  var root_43 = /* @__PURE__ */ from_html(`<tr><td> </td><td class="tabular-nums text-base-content/50"> </td><!></tr>`);
  var root_44 = /* @__PURE__ */ from_html(`<div class="overflow-x-auto"><table class="table table-sm w-full"><thead><tr class="text-base-content/60 text-xs uppercase tracking-wide"><th>Artifact</th><th>v</th><!></tr></thead><tbody></tbody></table></div>`);
  var root_45 = /* @__PURE__ */ from_html(`<div><!> <p class="text-xs text-base-content/50 mt-2"><span aria-hidden="true">🔵</span> assigned · <span aria-hidden="true">⏳</span> pending · <span aria-hidden="true">✅</span> approved · <span aria-hidden="true">❌</span> rejected/needs revision</p></div>`);
  var root_46 = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">None — you're not blocking any reviews.</p>`);
  var root_47 = /* @__PURE__ */ from_html(`<li> <span class="text-base-content/50 tabular-nums"> </span> <!> <!></li>`);
  var root_48 = /* @__PURE__ */ from_html(`<ul class="space-y-1"></ul>`);
  var root_49 = /* @__PURE__ */ from_html(`<p class="text-base-content/60 italic">No suggestions.</p>`);
  var root_50 = /* @__PURE__ */ from_html(`<span class="spinner loading loading-spinner loading-sm shrink-0" aria-hidden="true"></span> <span class="badge badge-soft badge-primary badge-sm shrink-0">Working…</span>`, 1);
  var root_51 = /* @__PURE__ */ from_html(`<li><button type="button"><span class="badge badge-primary badge-sm shrink-0 tabular-nums"> </span> <!> <span class="label"> </span></button></li>`);
  var root_52 = /* @__PURE__ */ from_html(`<ol class="space-y-2"></ol>`);
  var root_53 = /* @__PURE__ */ from_html(`<div class="h-screen overflow-hidden bg-base-100 text-base-content p-4 sm:p-6"><div class="h-full max-w-7xl mx-auto flex flex-col gap-4"><header class="shrink-0"><h1 class="text-3xl sm:text-4xl font-bold tracking-tight"> </h1></header> <!> <main class="flex-1 min-h-0 grid grid-cols-1 gap-4 lg:grid-cols-2"><div class="flex flex-col gap-4 min-h-0"><section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 min-h-0 shrink-0 overflow-auto max-h-[45%]"><h2 class="text-lg font-semibold tracking-tight mb-4">Summary</h2> <!> <!></section> <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 flex-1 min-h-0 overflow-auto"><h2 class="text-lg font-semibold tracking-tight mb-4">Needs your attention</h2> <div class="space-y-4"><div class="flex gap-3 items-start"><span class="badge badge-error badge-lg shrink-0" aria-hidden="true">🔴</span> <div class="min-w-0"><p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Overdue</p> <ul class="space-y-0.5"><!></ul></div></div> <div class="flex gap-3 items-start"><span class="badge badge-warning badge-lg shrink-0" aria-hidden="true">🟡</span> <div class="min-w-0"><p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Waiting on you</p> <ul class="space-y-0.5"><!></ul></div></div> <div class="flex gap-3 items-start"><span class="badge badge-info badge-lg shrink-0" aria-hidden="true">🔵</span> <div class="min-w-0"><p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Waiting on others</p> <ul class="space-y-0.5"><!></ul></div></div> <div class="flex gap-3 items-start"><span class="badge badge-neutral badge-lg shrink-0" aria-hidden="true">📬</span> <div class="min-w-0"><p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Since last run</p> <ul class="space-y-0.5"><!></ul></div></div> <div class="flex gap-3 items-start"><span class="badge badge-neutral badge-lg shrink-0" aria-hidden="true">📬</span> <div class="min-w-0"><p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Older unread</p> <ul class="space-y-0.5"><!></ul></div></div></div></section></div> <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 flex flex-col min-h-0"><h2 class="text-lg font-semibold tracking-tight mb-4 shrink-0">Today's queue</h2> <div class="flex-1 min-h-0 overflow-auto"><!></div></section></main> <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 shrink-0 h-[35%] min-h-[180px] max-h-[40%] flex flex-col"><div class="tabs tabs-boxed shrink-0 mb-4" role="tablist"><button type="button" role="tab">Capacity</button> <button type="button" role="tab">Reviews due</button> <button type="button" role="tab">Reviews owed</button> <button type="button" role="tab">Suggested actions</button></div> <div class="flex-1 min-h-0 overflow-auto"><!></div></section></div></div>`);
  function Digest($$anchor, $$props) {
    push($$props, true);
    let digest = /* @__PURE__ */ state(null);
    let loading = /* @__PURE__ */ state(true);
    let error = /* @__PURE__ */ state(null);
    let fetchMode = /* @__PURE__ */ state(false);
    let progressNodes = /* @__PURE__ */ state(proxy(/* @__PURE__ */ new Map()));
    let agentLogLines = /* @__PURE__ */ state(proxy([]));
    let dwellVersion = /* @__PURE__ */ state(0);
    let dwell = createDwellManager(DWELL_MS, () => {
      update(dwellVersion);
    });
    let activeTab = /* @__PURE__ */ state("actions");
    let dismissedWarnings = /* @__PURE__ */ state(proxy(/* @__PURE__ */ new Set()));
    async function loadDigest() {
      try {
        const res = await fetch("/api/digest");
        if (!res.ok) {
          throw new Error(`Error loading digest: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        set(digest, data, true);
        set(error, null);
      } catch (err) {
        set(error, err instanceof Error ? err.message : String(err), true);
        set(digest, null);
      } finally {
        set(loading, false);
      }
    }
    async function postAction(action) {
      const event = {
        id: Date.now(),
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        dir: "page→agent",
        type: "action_click",
        payload: action
      };
      try {
        await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event)
        });
      } catch (err) {
        console.error("Failed to post action_click:", err);
      }
    }
    function actionKey(action) {
      return `${action.section}/${action.key}`;
    }
    function isValidAction(value) {
      if (!value || typeof value !== "object") return false;
      const a = value;
      return typeof a.section === "string" && typeof a.key === "string" && typeof a.action === "string" && typeof a.label === "string" && typeof a.instruction === "string" && typeof a.aura_use_case === "string";
    }
    let filteredActions = /* @__PURE__ */ user_derived(() => (get(digest)?.actions ?? []).filter((a) => {
      if (isValidAction(a)) return true;
      console.warn("Skipping malformed digest action:", a);
      return false;
    }));
    let visibleWarningIndices = /* @__PURE__ */ user_derived(() => (get(digest)?.warnings ?? []).map((_, i) => i).filter((i) => !get(dismissedWarnings).has(i)));
    let expandedTasks = /* @__PURE__ */ state(proxy(/* @__PURE__ */ new Set()));
    function toggleTask(key) {
      if (get(expandedTasks).has(key)) {
        get(expandedTasks).delete(key);
        set(expandedTasks, new Set(get(expandedTasks)), true);
      } else {
        set(expandedTasks, /* @__PURE__ */ new Set([...get(expandedTasks), key]), true);
      }
    }
    function devLinksFor(key) {
      return (get(digest)?.dev_links ?? []).find((d) => d.task_key === key);
    }
    let followup = /* @__PURE__ */ user_derived(() => get(digest)?.followup ?? { currentlyWorkingOn: null });
    let workingKey = /* @__PURE__ */ user_derived(() => get(followup).currentlyWorkingOn);
    let hasWorkingMatch = /* @__PURE__ */ user_derived(() => get(filteredActions).some((a) => actionKey(a) === get(workingKey)));
    let started = /* @__PURE__ */ state(false);
    user_effect(() => {
      if (get(started)) return;
      set(started, true);
      loadDigest();
    });
    async function loadStateEvents() {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) return;
        const data = await res.json();
        const events = data?.events ?? [];
        const progressEvents = extractProgressEvents(events);
        const logEvents = extractAgentLogEvents(events);
        if (progressEvents.length > 0 || logEvents.length > 0) {
          const merged = mergeProgressNodes(get(progressNodes), progressEvents);
          set(progressNodes, new Map(merged), true);
          const newLines = logEvents.map((e) => e.message);
          for (const line of newLines) {
            if (!get(agentLogLines).includes(line)) {
              set(agentLogLines, [...get(agentLogLines), line], true);
            }
          }
          set(fetchMode, true);
        }
        maybeTransitionToDigest();
      } catch {
      }
    }
    async function maybeTransitionToDigest() {
      if (!get(fetchMode)) return;
      const tree = buildProgressTree(get(progressNodes));
      if (!isRootDone(tree)) return;
      try {
        const res = await fetch("/api/digest");
        if (res.ok) {
          const data = await res.json();
          set(digest, data, true);
          set(error, null);
          set(loading, false);
          set(fetchMode, false);
        }
      } catch {
      }
    }
    let stateDebounce = createDebounce(
      () => {
        void loadStateEvents();
      },
      30
    );
    user_effect(() => {
      const source2 = new EventSource("/events");
      source2.onmessage = () => loadDigest();
      source2.onerror = (err) => console.error("EventSource error:", err);
      void loadStateEvents();
      source2.addEventListener("change", () => {
        loadDigest();
      });
      source2.addEventListener("state-change", () => {
        stateDebounce.trigger();
      });
      return () => {
        source2.close();
        stateDebounce.cancel();
        dwell.cancel();
      };
    });
    function fmtPct(n) {
      return n == null ? "—" : `${n}%`;
    }
    const WORKDAY_HOURS = 8;
    function fmtHours(hours) {
      if (hours === null) return "—";
      const rounded = Math.round(hours / 0.25) * 0.25;
      const h = Math.floor(rounded);
      const m = Math.round((rounded - h) * 60);
      return `~${h}:${String(m).padStart(2, "0")}`;
    }
    function decisionEmoji(d) {
      if (!d.decided) return "⏳";
      const dec = d.decision.toUpperCase();
      if (dec === "APPROVED") return "✅";
      if (dec === "REJECTED" || dec === "NEEDS_REVISION") return "❌";
      return "•";
    }
    function reviewerNames(reviews) {
      const names = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (fullName) => {
        const first = fullName.split(",")[0].trim();
        if (first && !seen.has(first)) {
          seen.add(first);
          names.push(first);
        }
      };
      for (const r of reviews) {
        for (const d of r.decisions) add(d.user_name);
        for (const o of r.open_reviews) add(o.user_name);
      }
      return names;
    }
    function pctToHours(pct) {
      if (pct === null) return null;
      return pct * WORKDAY_HOURS / 100;
    }
    function statusIcon(node) {
      void get(dwellVersion);
      const status = effectiveStatus(node);
      if (node.children.length === 0) {
        dwell.observe(node.id, status);
      }
      const displayed = dwell.displayStatus(node.id, status);
      if (displayed === "running") return "spinner";
      if (displayed === "done") return "✓";
      return "✕";
    }
    const NOTIF_META = {
      "task.status_changed": { emoji: "🚦", label: "Task status changed" },
      "task.member_added": { emoji: "👤", label: "Task member added" },
      "task.owner_assigned": { emoji: "🎯", label: "Task owner assigned" },
      "artifact.review_assigned": { emoji: "🔍", label: "Review assigned" },
      "artifact.review_decided": { emoji: "⚖️", label: "Review decided" },
      "artifact.review_completed_approved": { emoji: "✅", label: "Review approved" },
      "artifact.review_completed_needs_revision": { emoji: "❌", label: "Review needs revision" },
      "artifact.review_run_overridden": { emoji: "🔁", label: "Review run overridden" },
      "comment.created": { emoji: "💬", label: "Comment created" },
      "comment.mention": { emoji: "📣", label: "Comment mention" },
      "question.answered": { emoji: "❓", label: "Question answered" }
    };
    const NOTIF_DEFAULT = { emoji: "🔔", label: "Notification" };
    function notifLine(note) {
      if (typeof note === "string") return note;
      if (note && typeof note === "object" && "line" in note) {
        const line = note.line;
        return typeof line === "string" ? line : "";
      }
      return "";
    }
    function notifUrl(note) {
      if (note && typeof note === "object" && "url" in note) {
        const url = note.url;
        return typeof url === "string" ? url : null;
      }
      return null;
    }
    function notifType(line) {
      if (!line) return "";
      const rest = line.split(" — ").slice(1).join(" — ");
      return rest.split(" by ")[0].split(": ")[0].trim();
    }
    function notifMeta(line) {
      return NOTIF_META[notifType(line)] ?? NOTIF_DEFAULT;
    }
    function notifBody(line) {
      if (!line) return "";
      const rest = line.split(" — ").slice(1).join(" — ");
      return rest.split(" by ").slice(1).join(" by ") || line;
    }
    var fragment = comment();
    var node_1 = first_child(fragment);
    {
      var consequent = ($$anchor2) => {
        var p = root();
        append($$anchor2, p);
      };
      var consequent_6 = ($$anchor2) => {
        const treeNode = ($$anchor3, node = noop) => {
          var li = root_5();
          var div = child(li);
          var node_2 = child(div);
          {
            var consequent_1 = ($$anchor4) => {
              var span = root_1();
              append($$anchor4, span);
            };
            var d_1 = /* @__PURE__ */ user_derived(() => statusIcon(node()) === "spinner");
            var consequent_2 = ($$anchor4) => {
              var span_1 = root_2();
              append($$anchor4, span_1);
            };
            var d_2 = /* @__PURE__ */ user_derived(() => statusIcon(node()) === "✕");
            var alternate = ($$anchor4) => {
              var span_2 = root_3();
              append($$anchor4, span_2);
            };
            if_block(node_2, ($$render) => {
              if (get(d_1)) $$render(consequent_1);
              else if (get(d_2)) $$render(consequent_2, 1);
              else $$render(alternate, -1);
            });
          }
          var span_3 = sibling(node_2, 2);
          var text2 = child(span_3);
          var node_3 = sibling(div, 2);
          {
            var consequent_3 = ($$anchor4) => {
              var ul = root_4();
              each(ul, 21, () => node().children, (child2) => child2.id, ($$anchor5, child2) => {
                treeNode($$anchor5, () => get(child2));
              });
              append($$anchor4, ul);
            };
            if_block(node_3, ($$render) => {
              if (node().children.length > 0) $$render(consequent_3);
            });
          }
          template_effect(() => {
            set_attribute(li, "data-node-id", node().id);
            set_text(text2, node().label);
          });
          append($$anchor3, li);
        };
        const tree = /* @__PURE__ */ user_derived(() => buildProgressTree(get(progressNodes)));
        var div_1 = root_10();
        var div_2 = child(div_1);
        var section = sibling(child(div_2), 2);
        var node_4 = child(section);
        {
          var consequent_4 = ($$anchor3) => {
            var p_1 = root_6();
            append($$anchor3, p_1);
          };
          var alternate_1 = ($$anchor3) => {
            var ul_1 = root_7();
            each(ul_1, 21, () => get(tree), (node) => node.id, ($$anchor4, node) => {
              treeNode($$anchor4, () => get(node));
            });
            append($$anchor3, ul_1);
          };
          if_block(node_4, ($$render) => {
            if (get(tree).length === 0) $$render(consequent_4);
            else $$render(alternate_1, -1);
          });
        }
        var node_5 = sibling(section, 2);
        {
          var consequent_5 = ($$anchor3) => {
            var section_1 = root_9();
            var ul_2 = sibling(child(section_1), 2);
            each(ul_2, 21, () => get(agentLogLines), index, ($$anchor4, line) => {
              var li_1 = root_8();
              var text_1 = child(li_1);
              template_effect(() => set_text(text_1, get(line)));
              append($$anchor4, li_1);
            });
            append($$anchor3, section_1);
          };
          if_block(node_5, ($$render) => {
            if (get(agentLogLines).length > 0) $$render(consequent_5);
          });
        }
        append($$anchor2, div_1);
      };
      var consequent_7 = ($$anchor2) => {
        var p_2 = root_11();
        var text_2 = child(p_2);
        template_effect(() => set_text(text_2, `Error: ${get(error) ?? ""}`));
        append($$anchor2, p_2);
      };
      var consequent_44 = ($$anchor2) => {
        const day = /* @__PURE__ */ user_derived(() => (/* @__PURE__ */ new Date(get(digest).date + "T00:00:00")).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }));
        const staleCorrections = /* @__PURE__ */ user_derived(() => get(digest).corrections.filter((c) => c.stale));
        var div_3 = root_53();
        var div_4 = child(div_3);
        var header = child(div_4);
        var h1 = child(header);
        var text_3 = child(h1);
        var node_6 = sibling(header, 2);
        {
          var consequent_8 = ($$anchor3) => {
            var div_5 = root_13();
            each(div_5, 20, () => get(visibleWarningIndices), (i) => i, ($$anchor4, i) => {
              var div_6 = root_12();
              var span_4 = child(div_6);
              var text_4 = child(span_4);
              var button = sibling(span_4, 2);
              template_effect(() => set_text(text_4, get(digest).warnings[i]));
              delegated("click", button, () => set(dismissedWarnings, /* @__PURE__ */ new Set([...get(dismissedWarnings), i]), true));
              append($$anchor4, div_6);
            });
            append($$anchor3, div_5);
          };
          if_block(node_6, ($$render) => {
            if (get(visibleWarningIndices).length > 0) $$render(consequent_8);
          });
        }
        var main = sibling(node_6, 2);
        var div_7 = child(main);
        var section_2 = child(div_7);
        var node_7 = sibling(child(section_2), 2);
        {
          var consequent_9 = ($$anchor3) => {
            var blockquote = root_14();
            var text_5 = child(blockquote);
            template_effect(() => set_text(text_5, get(digest).summary));
            append($$anchor3, blockquote);
          };
          var alternate_2 = ($$anchor3) => {
            var p_3 = root_15();
            append($$anchor3, p_3);
          };
          if_block(node_7, ($$render) => {
            if (get(digest).summary) $$render(consequent_9);
            else $$render(alternate_2, -1);
          });
        }
        var node_8 = sibling(node_7, 2);
        {
          var consequent_10 = ($$anchor3) => {
            var div_8 = root_17();
            var ul_3 = sibling(child(div_8), 2);
            each(ul_3, 21, () => get(staleCorrections), (correction) => correction.artifact_id, ($$anchor4, correction) => {
              var li_2 = root_16();
              var text_6 = sibling(child(li_2));
              var span_5 = sibling(text_6);
              var text_7 = child(span_5);
              template_effect(() => {
                set_text(text_6, ` ${get(correction).title ?? ""} — `);
                set_text(text_7, get(correction).note);
              });
              append($$anchor4, li_2);
            });
            append($$anchor3, div_8);
          };
          if_block(node_8, ($$render) => {
            if (get(staleCorrections).length > 0) $$render(consequent_10);
          });
        }
        var section_3 = sibling(section_2, 2);
        var div_9 = sibling(child(section_3), 2);
        var div_10 = child(div_9);
        var div_11 = sibling(child(div_10), 2);
        var ul_4 = sibling(child(div_11), 2);
        var node_9 = child(ul_4);
        {
          var consequent_11 = ($$anchor3) => {
            var li_3 = root_18();
            append($$anchor3, li_3);
          };
          var alternate_3 = ($$anchor3) => {
            var fragment_3 = comment();
            var node_10 = first_child(fragment_3);
            each(node_10, 17, () => get(digest).attention.overdue, index, ($$anchor4, item) => {
              var li_4 = root_20();
              var node_11 = child(li_4);
              {
                var consequent_12 = ($$anchor5) => {
                  var text_8 = text();
                  template_effect(() => set_text(text_8, `${get(item).key ?? ""} —`));
                  append($$anchor5, text_8);
                };
                if_block(node_11, ($$render) => {
                  if (get(item).key) $$render(consequent_12);
                });
              }
              var text_9 = sibling(node_11);
              var node_12 = sibling(text_9);
              {
                var consequent_13 = ($$anchor5) => {
                  var span_6 = root_19();
                  var text_10 = child(span_6);
                  template_effect(() => set_text(text_10, `(${get(item).days ?? ""}d)`));
                  append($$anchor5, span_6);
                };
                if_block(node_12, ($$render) => {
                  if (get(item).days) $$render(consequent_13);
                });
              }
              template_effect(() => set_text(text_9, `${get(item).title ?? ""} `));
              append($$anchor4, li_4);
            });
            append($$anchor3, fragment_3);
          };
          if_block(node_9, ($$render) => {
            if (get(digest).attention.overdue.length === 0) $$render(consequent_11);
            else $$render(alternate_3, -1);
          });
        }
        var div_12 = sibling(div_10, 2);
        var div_13 = sibling(child(div_12), 2);
        var ul_5 = sibling(child(div_13), 2);
        var node_13 = child(ul_5);
        {
          var consequent_14 = ($$anchor3) => {
            var li_5 = root_18();
            append($$anchor3, li_5);
          };
          var alternate_4 = ($$anchor3) => {
            var fragment_5 = comment();
            var node_14 = first_child(fragment_5);
            each(node_14, 17, () => get(digest).attention.waiting_on_you, index, ($$anchor4, item) => {
              var li_6 = root_20();
              var node_15 = child(li_6);
              {
                var consequent_15 = ($$anchor5) => {
                  var text_11 = text();
                  template_effect(() => set_text(text_11, `${get(item).key ?? ""} —`));
                  append($$anchor5, text_11);
                };
                if_block(node_15, ($$render) => {
                  if (get(item).key) $$render(consequent_15);
                });
              }
              var text_12 = sibling(node_15);
              var node_16 = sibling(text_12);
              {
                var consequent_16 = ($$anchor5) => {
                  var span_7 = root_19();
                  var text_13 = child(span_7);
                  template_effect(() => set_text(text_13, `(${get(item).days ?? ""}d)`));
                  append($$anchor5, span_7);
                };
                if_block(node_16, ($$render) => {
                  if (get(item).days) $$render(consequent_16);
                });
              }
              template_effect(() => set_text(text_12, `${get(item).title ?? ""} `));
              append($$anchor4, li_6);
            });
            append($$anchor3, fragment_5);
          };
          if_block(node_13, ($$render) => {
            if (get(digest).attention.waiting_on_you.length === 0) $$render(consequent_14);
            else $$render(alternate_4, -1);
          });
        }
        var div_14 = sibling(div_12, 2);
        var div_15 = sibling(child(div_14), 2);
        var ul_6 = sibling(child(div_15), 2);
        var node_17 = child(ul_6);
        {
          var consequent_17 = ($$anchor3) => {
            var li_7 = root_18();
            append($$anchor3, li_7);
          };
          var alternate_5 = ($$anchor3) => {
            var fragment_7 = comment();
            var node_18 = first_child(fragment_7);
            each(node_18, 17, () => get(digest).attention.waiting_on_others, index, ($$anchor4, item) => {
              var li_8 = root_20();
              var node_19 = child(li_8);
              {
                var consequent_18 = ($$anchor5) => {
                  var text_14 = text();
                  template_effect(() => set_text(text_14, `${get(item).key ?? ""} —`));
                  append($$anchor5, text_14);
                };
                if_block(node_19, ($$render) => {
                  if (get(item).key) $$render(consequent_18);
                });
              }
              var text_15 = sibling(node_19);
              var node_20 = sibling(text_15);
              {
                var consequent_19 = ($$anchor5) => {
                  var span_8 = root_19();
                  var text_16 = child(span_8);
                  template_effect(() => set_text(text_16, `(${get(item).days ?? ""}d)`));
                  append($$anchor5, span_8);
                };
                if_block(node_20, ($$render) => {
                  if (get(item).days) $$render(consequent_19);
                });
              }
              template_effect(() => set_text(text_15, `${get(item).title ?? ""} `));
              append($$anchor4, li_8);
            });
            append($$anchor3, fragment_7);
          };
          if_block(node_17, ($$render) => {
            if (get(digest).attention.waiting_on_others.length === 0) $$render(consequent_17);
            else $$render(alternate_5, -1);
          });
        }
        var div_16 = sibling(div_14, 2);
        var div_17 = sibling(child(div_16), 2);
        var ul_7 = sibling(child(div_17), 2);
        var node_21 = child(ul_7);
        {
          var consequent_20 = ($$anchor3) => {
            var li_9 = root_21();
            append($$anchor3, li_9);
          };
          var alternate_7 = ($$anchor3) => {
            var fragment_9 = comment();
            var node_22 = first_child(fragment_9);
            each(node_22, 17, () => get(digest).attention.notifications.since_last_run, index, ($$anchor4, note) => {
              const line = /* @__PURE__ */ user_derived(() => notifLine(get(note)));
              const m = /* @__PURE__ */ user_derived(() => notifMeta(get(line)));
              const body = /* @__PURE__ */ user_derived(() => notifBody(get(line)));
              const url = /* @__PURE__ */ user_derived(() => notifUrl(get(note)));
              var li_10 = root_24();
              var span_9 = child(li_10);
              var span_10 = child(span_9);
              var text_17 = child(span_10);
              var node_23 = sibling(span_9, 2);
              {
                var consequent_21 = ($$anchor5) => {
                  var a_1 = root_22();
                  var text_18 = child(a_1);
                  template_effect(() => {
                    set_attribute(a_1, "href", get(url));
                    set_text(text_18, get(body));
                  });
                  append($$anchor5, a_1);
                };
                var alternate_6 = ($$anchor5) => {
                  var span_11 = root_23();
                  var text_19 = child(span_11);
                  template_effect(() => set_text(text_19, get(body)));
                  append($$anchor5, span_11);
                };
                if_block(node_23, ($$render) => {
                  if (get(url)) $$render(consequent_21);
                  else $$render(alternate_6, -1);
                });
              }
              template_effect(() => {
                set_attribute(span_9, "data-tip", get(m).label);
                set_text(text_17, get(m).emoji);
              });
              append($$anchor4, li_10);
            });
            append($$anchor3, fragment_9);
          };
          if_block(node_21, ($$render) => {
            if (get(digest).attention.notifications.since_last_run.length === 0) $$render(consequent_20);
            else $$render(alternate_7, -1);
          });
        }
        var div_18 = sibling(div_16, 2);
        var div_19 = sibling(child(div_18), 2);
        var ul_8 = sibling(child(div_19), 2);
        var node_24 = child(ul_8);
        {
          var consequent_22 = ($$anchor3) => {
            var li_11 = root_25();
            append($$anchor3, li_11);
          };
          var alternate_9 = ($$anchor3) => {
            var fragment_10 = comment();
            var node_25 = first_child(fragment_10);
            each(node_25, 17, () => get(digest).attention.notifications.older_unread, index, ($$anchor4, note) => {
              const line = /* @__PURE__ */ user_derived(() => notifLine(get(note)));
              const m = /* @__PURE__ */ user_derived(() => notifMeta(get(line)));
              const body = /* @__PURE__ */ user_derived(() => notifBody(get(line)));
              const url = /* @__PURE__ */ user_derived(() => notifUrl(get(note)));
              var li_12 = root_24();
              var span_12 = child(li_12);
              var span_13 = child(span_12);
              var text_20 = child(span_13);
              var node_26 = sibling(span_12, 2);
              {
                var consequent_23 = ($$anchor5) => {
                  var a_2 = root_22();
                  var text_21 = child(a_2);
                  template_effect(() => {
                    set_attribute(a_2, "href", get(url));
                    set_text(text_21, get(body));
                  });
                  append($$anchor5, a_2);
                };
                var alternate_8 = ($$anchor5) => {
                  var span_14 = root_23();
                  var text_22 = child(span_14);
                  template_effect(() => set_text(text_22, get(body)));
                  append($$anchor5, span_14);
                };
                if_block(node_26, ($$render) => {
                  if (get(url)) $$render(consequent_23);
                  else $$render(alternate_8, -1);
                });
              }
              template_effect(() => {
                set_attribute(span_12, "data-tip", get(m).label);
                set_text(text_20, get(m).emoji);
              });
              append($$anchor4, li_12);
            });
            append($$anchor3, fragment_10);
          };
          if_block(node_24, ($$render) => {
            if (get(digest).attention.notifications.older_unread.length === 0) $$render(consequent_22);
            else $$render(alternate_9, -1);
          });
        }
        var section_4 = sibling(div_7, 2);
        var div_20 = sibling(child(section_4), 2);
        var node_27 = child(div_20);
        {
          var consequent_24 = ($$anchor3) => {
            var p_4 = root_26();
            append($$anchor3, p_4);
          };
          var alternate_12 = ($$anchor3) => {
            const committedRows = /* @__PURE__ */ user_derived(() => get(digest).queue.filter((r) => r.capacity_pct !== null && r.capacity_pct > 0));
            const totalPct = /* @__PURE__ */ user_derived(() => get(committedRows).reduce((s, r) => s + (r.capacity_pct ?? 0), 0));
            const totalHours = /* @__PURE__ */ user_derived(() => get(committedRows).reduce((s, r) => s + (r.hours ?? pctToHours(r.capacity_pct) ?? 0), 0));
            var div_21 = root_37();
            var node_28 = child(div_21);
            each(node_28, 17, () => get(digest).queue, (row) => row.key, ($$anchor4, row) => {
              const dl = /* @__PURE__ */ user_derived(() => devLinksFor(get(row).key ?? ""));
              const expanded = /* @__PURE__ */ user_derived(() => get(expandedTasks).has(get(row).key ?? ""));
              var div_22 = root_36();
              var span_15 = child(div_22);
              var text_23 = child(span_15);
              var div_23 = sibling(span_15, 2);
              var p_5 = child(div_23);
              var node_29 = child(p_5);
              {
                var consequent_25 = ($$anchor5) => {
                  var span_16 = root_27();
                  var text_24 = child(span_16);
                  template_effect(() => set_text(text_24, `${get(row).key ?? ""} —`));
                  append($$anchor5, span_16);
                };
                if_block(node_29, ($$render) => {
                  if (get(row).key) $$render(consequent_25);
                });
              }
              var text_25 = sibling(node_29, 1, true);
              var div_24 = sibling(p_5, 2);
              var span_17 = child(div_24);
              var text_26 = child(span_17);
              var span_18 = sibling(span_17, 2);
              var text_27 = child(span_18);
              var span_19 = sibling(span_18, 2);
              var text_28 = child(span_19);
              var span_20 = sibling(span_19, 2);
              var text_29 = child(span_20);
              var button_1 = sibling(span_20, 2);
              var svg = child(button_1);
              let classes;
              var node_30 = sibling(div_24, 2);
              {
                var consequent_29 = ($$anchor5) => {
                  var div_25 = root_35();
                  var node_31 = child(div_25);
                  {
                    var consequent_28 = ($$anchor6) => {
                      var fragment_11 = root_33();
                      var node_32 = first_child(fragment_11);
                      each(node_32, 17, () => get(dl).pull_requests, (pr) => pr.id, ($$anchor7, pr) => {
                        var div_26 = root_28();
                        var a_3 = sibling(child(div_26), 2);
                        var text_30 = child(a_3);
                        template_effect(() => {
                          set_attribute(a_3, "href", get(pr).url);
                          set_text(text_30, `${get(pr).id ?? ""} · ${get(pr).title ?? ""}`);
                        });
                        append($$anchor7, div_26);
                      });
                      var node_33 = sibling(node_32, 2);
                      each(node_33, 17, () => get(dl).branches, (br) => br.name, ($$anchor7, br) => {
                        var div_27 = root_32();
                        var node_34 = sibling(child(div_27), 2);
                        {
                          var consequent_26 = ($$anchor8) => {
                            var a_4 = root_29();
                            var text_31 = child(a_4);
                            template_effect(() => {
                              set_attribute(a_4, "href", get(br).url);
                              set_text(text_31, get(br).name);
                            });
                            append($$anchor8, a_4);
                          };
                          var alternate_10 = ($$anchor8) => {
                            var span_21 = root_30();
                            var text_32 = child(span_21);
                            template_effect(() => set_text(text_32, get(br).name));
                            append($$anchor8, span_21);
                          };
                          if_block(node_34, ($$render) => {
                            if (get(br).url) $$render(consequent_26);
                            else $$render(alternate_10, -1);
                          });
                        }
                        var node_35 = sibling(node_34, 2);
                        {
                          var consequent_27 = ($$anchor8) => {
                            var fragment_12 = root_31();
                            var span_22 = sibling(first_child(fragment_12));
                            var text_33 = child(span_22);
                            template_effect(() => set_text(text_33, get(br).last_commit));
                            append($$anchor8, fragment_12);
                          };
                          if_block(node_35, ($$render) => {
                            if (get(br).last_commit) $$render(consequent_27);
                          });
                        }
                        append($$anchor7, div_27);
                      });
                      append($$anchor6, fragment_11);
                    };
                    var alternate_11 = ($$anchor6) => {
                      var p_6 = root_34();
                      append($$anchor6, p_6);
                    };
                    if_block(node_31, ($$render) => {
                      if (get(dl) && (get(dl).pull_requests.length || get(dl).branches.length)) $$render(consequent_28);
                      else $$render(alternate_11, -1);
                    });
                  }
                  append($$anchor5, div_25);
                };
                if_block(node_30, ($$render) => {
                  if (get(expanded)) $$render(consequent_29);
                });
              }
              template_effect(
                ($0, $1) => {
                  set_text(text_23, get(row).rank);
                  set_text(text_25, get(row).title);
                  set_text(text_26, get(row).status);
                  set_text(text_27, get(row).role);
                  set_text(text_28, $0);
                  set_text(text_29, $1);
                  set_attribute(button_1, "aria-expanded", get(expanded));
                  classes = set_class(svg, 0, "w-3 h-3 transition-transform duration-150", null, classes, { "rotate-90": get(expanded) });
                },
                [
                  () => fmtPct(get(row).capacity_pct),
                  () => fmtHours(get(row).hours ?? pctToHours(get(row).capacity_pct))
                ]
              );
              delegated("click", button_1, () => toggleTask(get(row).key ?? ""));
              append($$anchor4, div_22);
            });
            var div_28 = sibling(node_28, 2);
            var span_23 = sibling(child(div_28), 2);
            var text_34 = child(span_23);
            var span_24 = sibling(span_23, 2);
            var text_35 = child(span_24);
            var p_7 = sibling(div_28, 2);
            p_7.textContent = "8hr workday → hours = capacity% × 8, rounded to ¼h";
            template_effect(
              ($0) => {
                set_text(text_34, `${get(totalPct) ?? ""}%`);
                set_text(text_35, $0);
              },
              [() => fmtHours(get(totalHours))]
            );
            append($$anchor3, div_21);
          };
          if_block(node_27, ($$render) => {
            if (get(digest).queue.length === 0) $$render(consequent_24);
            else $$render(alternate_12, -1);
          });
        }
        var section_5 = sibling(main, 2);
        var div_29 = child(section_5);
        var button_2 = child(div_29);
        let classes_1;
        var button_3 = sibling(button_2, 2);
        let classes_2;
        var button_4 = sibling(button_3, 2);
        let classes_3;
        var button_5 = sibling(button_4, 2);
        let classes_4;
        var div_30 = sibling(div_29, 2);
        var node_36 = child(div_30);
        {
          var consequent_33 = ($$anchor3) => {
            var div_31 = root_39();
            var node_37 = child(div_31);
            {
              var consequent_32 = ($$anchor4) => {
                const c = /* @__PURE__ */ user_derived(() => get(digest).capacity);
                const over = /* @__PURE__ */ user_derived(() => get(c).over);
                var fragment_13 = root_38();
                var div_32 = first_child(fragment_13);
                var div_33 = child(div_32);
                var span_25 = sibling(child(div_33), 2);
                var text_36 = child(span_25);
                var div_34 = sibling(div_33, 2);
                var span_26 = sibling(child(div_34), 2);
                let classes_5;
                var text_37 = child(span_26);
                var node_38 = sibling(text_37);
                {
                  var consequent_30 = ($$anchor5) => {
                    var text_38 = text("⚠️");
                    append($$anchor5, text_38);
                  };
                  if_block(node_38, ($$render) => {
                    if (get(over)) $$render(consequent_30);
                  });
                }
                var div_35 = sibling(div_34, 2);
                var span_27 = sibling(child(div_35), 2);
                var text_39 = child(span_27);
                var div_36 = sibling(div_35, 2);
                var span_28 = sibling(child(div_36), 2);
                let classes_6;
                var text_40 = child(span_28);
                var node_39 = sibling(text_40);
                {
                  var consequent_31 = ($$anchor5) => {
                    var text_41 = text("⚠️");
                    append($$anchor5, text_41);
                  };
                  if_block(node_39, ($$render) => {
                    if (get(over)) $$render(consequent_31);
                  });
                }
                var p_8 = sibling(div_32, 2);
                var strong = sibling(child(p_8));
                var text_42 = child(strong);
                var text_43 = sibling(strong);
                text_43.nodeValue = " / 8h workday";
                template_effect(
                  ($0) => {
                    set_text(text_36, `${get(c).base_pct ?? ""}%`);
                    classes_5 = set_class(span_26, 1, "text-lg font-semibold tabular-nums", null, classes_5, { "text-warning": get(over) });
                    set_text(text_37, `${get(c).committed_pct ?? ""}%`);
                    set_text(text_39, `${get(c).free_pct ?? ""}%`);
                    classes_6 = set_class(span_28, 1, "text-lg font-semibold tabular-nums", null, classes_6, { "text-warning": get(over) });
                    set_text(text_40, `${get(c).utilization_pct ?? ""}%`);
                    set_text(text_42, `${$0 ?? ""}h`);
                  },
                  [() => get(c).total_hours.toFixed(1)]
                );
                append($$anchor4, fragment_13);
              };
              if_block(node_37, ($$render) => {
                $$render(consequent_32);
              });
            }
            append($$anchor3, div_31);
          };
          var consequent_36 = ($$anchor3) => {
            var div_37 = root_39();
            var node_40 = child(div_37);
            {
              var consequent_34 = ($$anchor4) => {
                var p_9 = root_40();
                append($$anchor4, p_9);
              };
              var alternate_13 = ($$anchor4) => {
                var div_38 = root_45();
                var node_41 = child(div_38);
                {
                  var consequent_35 = ($$anchor5) => {
                    const names = /* @__PURE__ */ user_derived(() => reviewerNames(get(digest).reviews));
                    var div_39 = root_44();
                    var table = child(div_39);
                    var thead = child(table);
                    var tr = child(thead);
                    var node_42 = sibling(child(tr), 2);
                    each(node_42, 16, () => get(names), (name) => name, ($$anchor6, name) => {
                      var th = root_41();
                      var text_44 = child(th);
                      template_effect(() => set_text(text_44, name));
                      append($$anchor6, th);
                    });
                    var tbody = sibling(thead);
                    each(tbody, 21, () => get(digest).reviews, (review) => review.artifact_id, ($$anchor6, review) => {
                      const byName = /* @__PURE__ */ user_derived(() => new Map(get(review).decisions.map((d) => [d.user_name.split(",")[0].trim(), decisionEmoji(d)])));
                      const pending = /* @__PURE__ */ user_derived(() => new Set(get(review).open_reviews.filter((o) => !o.decided).map((o) => o.user_name.split(",")[0].trim())));
                      var tr_1 = root_43();
                      var td = child(tr_1);
                      var text_45 = child(td);
                      var td_1 = sibling(td);
                      var text_46 = child(td_1);
                      var node_43 = sibling(td_1);
                      each(node_43, 16, () => get(names), (name) => name, ($$anchor7, name) => {
                        var td_2 = root_42();
                        var text_47 = child(td_2);
                        template_effect(
                          ($0, $1) => {
                            set_attribute(td_2, "title", $0);
                            set_text(text_47, $1);
                          },
                          [
                            () => get(pending).has(name) ? "Assigned — review still pending" : "",
                            () => get(byName).get(name) ?? (get(pending).has(name) ? "🔵" : "")
                          ]
                        );
                        append($$anchor7, td_2);
                      });
                      template_effect(() => {
                        set_text(text_45, get(review).title);
                        set_text(text_46, get(review).version);
                      });
                      append($$anchor6, tr_1);
                    });
                    append($$anchor5, div_39);
                  };
                  if_block(node_41, ($$render) => {
                    $$render(consequent_35);
                  });
                }
                append($$anchor4, div_38);
              };
              if_block(node_40, ($$render) => {
                if (get(digest).reviews.length === 0) $$render(consequent_34);
                else $$render(alternate_13, -1);
              });
            }
            append($$anchor3, div_37);
          };
          var consequent_40 = ($$anchor3) => {
            var div_40 = root_39();
            var node_44 = child(div_40);
            {
              var consequent_37 = ($$anchor4) => {
                var p_10 = root_46();
                append($$anchor4, p_10);
              };
              var alternate_14 = ($$anchor4) => {
                var ul_9 = root_48();
                each(ul_9, 21, () => get(digest).reviews_owed, (review) => review.artifact_id, ($$anchor5, review) => {
                  var li_13 = root_47();
                  var text_48 = child(li_13);
                  var span_29 = sibling(text_48);
                  var text_49 = child(span_29);
                  var node_45 = sibling(span_29, 2);
                  {
                    var consequent_38 = ($$anchor6) => {
                      var span_30 = root_19();
                      var text_50 = child(span_30);
                      template_effect(($0) => set_text(text_50, `(due ${$0 ?? ""})`), [() => get(review).deadline.slice(0, 10)]);
                      append($$anchor6, span_30);
                    };
                    if_block(node_45, ($$render) => {
                      if (get(review).deadline) $$render(consequent_38);
                    });
                  }
                  var node_46 = sibling(node_45, 2);
                  {
                    var consequent_39 = ($$anchor6) => {
                      var span_31 = root_19();
                      var text_51 = child(span_31);
                      template_effect(() => set_text(text_51, `— from ${get(review).initiator ?? ""}`));
                      append($$anchor6, span_31);
                    };
                    if_block(node_46, ($$render) => {
                      if (get(review).initiator) $$render(consequent_39);
                    });
                  }
                  template_effect(() => {
                    set_text(text_48, `${get(review).title ?? ""} `);
                    set_text(text_49, `v${get(review).version ?? ""}`);
                  });
                  append($$anchor5, li_13);
                });
                append($$anchor4, ul_9);
              };
              if_block(node_44, ($$render) => {
                if (get(digest).reviews_owed.length === 0) $$render(consequent_37);
                else $$render(alternate_14, -1);
              });
            }
            append($$anchor3, div_40);
          };
          var consequent_43 = ($$anchor3) => {
            var div_41 = root_39();
            var node_47 = child(div_41);
            {
              var consequent_41 = ($$anchor4) => {
                var p_11 = root_49();
                append($$anchor4, p_11);
              };
              var alternate_15 = ($$anchor4) => {
                var ol = root_52();
                each(ol, 23, () => get(filteredActions), (action) => actionKey(action), ($$anchor5, action, i) => {
                  const key = /* @__PURE__ */ user_derived(() => actionKey(get(action)));
                  const active = /* @__PURE__ */ user_derived(() => get(key) === get(followup).currentlyWorkingOn);
                  var li_14 = root_51();
                  var button_6 = child(li_14);
                  let classes_7;
                  var span_32 = child(button_6);
                  var text_52 = child(span_32);
                  var node_48 = sibling(span_32, 2);
                  {
                    var consequent_42 = ($$anchor6) => {
                      var fragment_14 = root_50();
                      append($$anchor6, fragment_14);
                    };
                    if_block(node_48, ($$render) => {
                      if (get(active)) $$render(consequent_42);
                    });
                  }
                  var span_33 = sibling(node_48, 2);
                  var text_53 = child(span_33);
                  template_effect(() => {
                    classes_7 = set_class(button_6, 1, "btn btn-ghost w-full justify-start text-left flex gap-3 items-start h-auto min-h-[2.5rem] py-2 px-3", null, classes_7, {
                      "btn-active": get(active),
                      "btn-disabled": get(hasWorkingMatch) && !get(active)
                    });
                    set_attribute(button_6, "data-action-key", get(key));
                    set_attribute(button_6, "title", get(active) ? "continue in pi" : void 0);
                    button_6.disabled = get(hasWorkingMatch) && !get(active);
                    set_attribute(button_6, "aria-disabled", get(hasWorkingMatch) && !get(active) ? "true" : void 0);
                    set_text(text_52, get(i) + 1);
                    set_text(text_53, get(action).label);
                  });
                  delegated("click", button_6, () => postAction(get(action)));
                  append($$anchor5, li_14);
                });
                append($$anchor4, ol);
              };
              if_block(node_47, ($$render) => {
                if (get(filteredActions).length === 0) $$render(consequent_41);
                else $$render(alternate_15, -1);
              });
            }
            append($$anchor3, div_41);
          };
          if_block(node_36, ($$render) => {
            if (get(activeTab) === "capacity") $$render(consequent_33);
            else if (get(activeTab) === "reviews-due") $$render(consequent_36, 1);
            else if (get(activeTab) === "reviews-owed") $$render(consequent_40, 2);
            else if (get(activeTab) === "actions") $$render(consequent_43, 3);
          });
        }
        template_effect(() => {
          set_text(text_3, get(day));
          classes_1 = set_class(button_2, 1, "tab", null, classes_1, { "tab-active": get(activeTab) === "capacity" });
          set_attribute(button_2, "aria-selected", get(activeTab) === "capacity");
          classes_2 = set_class(button_3, 1, "tab", null, classes_2, { "tab-active": get(activeTab) === "reviews-due" });
          set_attribute(button_3, "aria-selected", get(activeTab) === "reviews-due");
          classes_3 = set_class(button_4, 1, "tab", null, classes_3, { "tab-active": get(activeTab) === "reviews-owed" });
          set_attribute(button_4, "aria-selected", get(activeTab) === "reviews-owed");
          classes_4 = set_class(button_5, 1, "tab", null, classes_4, { "tab-active": get(activeTab) === "actions" });
          set_attribute(button_5, "aria-selected", get(activeTab) === "actions");
        });
        delegated("click", button_2, () => set(activeTab, "capacity"));
        delegated("click", button_3, () => set(activeTab, "reviews-due"));
        delegated("click", button_4, () => set(activeTab, "reviews-owed"));
        delegated("click", button_5, () => set(activeTab, "actions"));
        append($$anchor2, div_3);
      };
      if_block(node_1, ($$render) => {
        if (get(loading)) $$render(consequent);
        else if (get(fetchMode)) $$render(consequent_6, 1);
        else if (get(error)) $$render(consequent_7, 2);
        else if (get(digest)) $$render(consequent_44, 3);
      });
    }
    append($$anchor, fragment);
    pop();
  }
  delegate(["click"]);
  const target = document.getElementById("app");
  if (target) {
    mount(Digest, { target });
  }
})();
